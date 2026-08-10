---
project: web-multiAI-tool
type: 아키텍처
status: v1 초안
created: 2026-08-10
tags:
  - project/web-multiAI-tool
  - 아키텍처
  - API
  - 데이터모델
---

# 아키텍처 설계

무엇을 만드는지는 [[REQUIREMENTS]]에, 화면과 흐름은 [[UX]]에 있습니다. **이 문서는 시스템이 어떻게 나뉘고 데이터가 어떤 모양으로 흐르는지의 정본입니다** — 컴포넌트 경계, 데이터 모델, API 계약, 동기화·lock 프로토콜, 배포, 보안, 관측성을 다룹니다.

수치가 등장하는 곳은 전부 "시작값"입니다. 실측이 다르게 나오면 값을 고치되, 고친 사실을 남깁니다.

---

## 1. 컴포넌트 경계

```
client/
  editor/            에디터 앱 (로그인 필요)
    scene/           씬 그래프 스토어 (Zustand)
    commands/        커맨드 스택 — 직렬화 가능, 3소비자(undo/조수/협업)
    viewport/        R3F 뷰포트, 기즈모
    timeline/        애니메이션 타임라인 + 이벤트 마커
    audio/
      scheduler/     룩어헤드 스케줄러 (예약 이력 훅 포함)
    generate/        생성 패널, 잡 카드
    assistant/       조수 채팅
    sync/            IndexedDB 영속 + 서버 동기화 큐
  public/            공개 화면 (로그인 불필요, 뷰어 전용 경량 번들)
    gallery/         갤러리
    viewer/          공유 뷰어 — WMT 스키마의 세 번째 소비자
  api/               서버 호출 단일 진입 파일
  ui/                디자인 시스템 — 토큰 3층 + 공유 컴포넌트 (editor·public 공용, N-14)
  export/            glTF 익스포터, wmt extras, 좌표·단위 변환

server/  (Spring Boot)
  auth/              OAuth 로그인, 세션
  credits/           크레딧 원장, 선차감·정산, 전역 캡
  adapters/          외부 API 어댑터 + registry.ts (라이선스 CI 대상)
  jobs/              생성 잡 큐, 상태 머신, STOMP 진행률
  storage/           S3 호환 스토리지, 서명 URL
  projects/          프로젝트·씬 리비전·에셋 버전 (내용 해석 없음)
  share/             공유 링크, 갤러리 질의
  collab/            프레즌스, lock 리스, 커맨드 중계
  postprocess/       Node 자식 프로세스 폴백 (H-5)

shared/
  postprocess/       런타임 중립 — ArrayBuffer in/out, node:*·DOM import 금지
  types/             DTO, 단가표, WMT 스키마 타입

unity/               C# 임포터
fixtures/demo/       데모 레일 픽스처
```

**경계 규칙 세 가지.**

1. **클라이언트→서버 호출은 `client/api/` 한 곳만 지납니다.** 컴포넌트에 `fetch`를 흩뿌리지 않습니다.
2. **외부 생성 API 호출은 `server/adapters/registry.ts` 등록 항목만 통과합니다.** CI가 우회를 막습니다(`CLAUDE.md`).
3. **`client/public/`은 에디터 코드를 import하지 않습니다.** 공유받은 사람이 에디터 번들 전체를 내려받는 구조를 빌드 단계에서 막습니다. 두 번들이 공유하는 것은 `shared/types/`와 WMT 파서, three.js 로더, 그리고 `client/ui/` 디자인 시스템 컴포넌트뿐입니다. `client/ui/`는 역으로 `editor/`·`public/` 어느 쪽도 import하지 않습니다 — 의존은 항상 한 방향입니다.

---

## 2. 인증

**OAuth 소셜 로그인(Google, GitHub)만 제공합니다.** 자체 비밀번호 저장이 없으므로 재설정·유출 대응 표면이 통째로 사라집니다. 근거는 [[REQUIREMENTS]] I-1.

- Spring Security OAuth2 Client로 코드 플로우를 수행하고, 성공 시 **자체 세션 JWT를 HttpOnly + Secure + SameSite=Lax 쿠키**로 발급합니다. 클라이언트 JS는 토큰을 읽을 수 없습니다.
- 액세스 토큰 수명 1시간 / 리프레시 토큰 14일, 리프레시는 회전(rotation)합니다.
- STOMP 연결은 핸드셰이크 시점의 쿠키로 인증합니다.
- 공개 화면(갤러리·뷰어)은 인증 없이 접근되며, 서버는 공개 리소스 여부를 토큰이 아니라 리소스의 `visibility`와 공유 토큰으로 판정합니다.

---

## 3. 생성 잡 파이프라인

### 3.1 상태 머신

```
requested → queued → submitted → running → downloading → succeeded
                │         │          │          │
                └─────────┴──────────┴──────────┴→ failed(원인 분류)
                                                 → cancelled
```

- `submitted`부터는 **제공자가 준 작업 ID가 영속 정체성**입니다. 서버가 재시작해도 폴링으로 이어받습니다.
- `downloading`은 제공자 URL이 만료되기 전에 산출물을 스토리지로 옮기는 단계입니다(H-2). 이 단계의 실패는 생성 실패와 구분해 기록합니다 — 비용은 이미 발생했기 때문입니다.
- 실패는 `provider_error` / `timeout` / `quota_exceeded` / `validation_failed`(C-1·C-3 게이트 불통과) / `download_failed`로 분류하고, 분류가 [[UX]]의 오류 문구 사전과 1:1로 대응합니다(N-5).

### 3.2 크레딧 흐름

```
견적 → 잔액 확인 → 선차감(hold) → 제공자 호출 → 실비 정산(release)
                     │                              │
                     └── 호출 실패 시 전액 환원 ──────┘
```

- 견적은 `shared/types/`의 단가표로 서버가 계산해 응답에 실어 보냅니다.
- 선차감과 정산은 **크레딧 원장에 별도 행으로** 남습니다. 잔액은 파생값이며 언제나 원장 합산으로 재계산 가능합니다(I-2).
- 전역 캡(I-4)은 원장이 아니라 **당월 실비 합계 뷰**로 판정합니다. 80%에서 운영자 알림, 100%에서 생성 계열 429 거부.

### 3.3 진행률

STOMP `/user/queue/jobs`로 개인 진행률을, 협업 세션에서는 `/topic/projects/{id}/jobs`로 프로젝트 진행률을 푸시합니다. 클라이언트가 끊겼다 돌아오면 REST `GET /jobs?active=true`로 현재 상태를 다시 읽습니다(N-4) — **푸시는 최적화이고 정본은 REST 조회입니다.**

---

## 4. 데이터 모델 (PostgreSQL)

서버는 씬과 에셋의 **내용을 해석하지 않습니다.** JSON·바이너리는 스토리지에, 행에는 포인터와 소유권·버전만 둡니다.

```
users
  id, oauth_provider, oauth_subject, email, display_name,
  avatar_url, created_at, deleted_at
  UNIQUE(oauth_provider, oauth_subject)

credit_ledger
  id, user_id, delta,             -- 양수 지급 / 음수 차감
  kind,                            -- signup_grant | hold | settle | refund | admin
  job_id NULL, balance_after, created_at
  -- 잔액 = SUM(delta). balance_after는 검산용 스냅샷

projects
  id, owner_id, name, thumbnail_url, created_at, updated_at

project_members                    -- K-1 협업. P2 전까지는 owner 행만 존재
  project_id, user_id, role,       -- owner | editor | viewer
  PRIMARY KEY(project_id, user_id)

scene_revisions                    -- H-8. 서버가 해석하지 않는 블롭
  id, project_id, seq,             -- 프로젝트 내 단조 증가
  blob_url, byte_size, author_id,
  cause,                           -- manual | autosave | checkpoint
  created_at
  UNIQUE(project_id, seq)

assets
  id, project_id, kind,            -- mesh | audio
  name, current_version_id, visibility,  -- private | public
  created_at, updated_at

asset_versions                     -- J-4 버전 계보
  id, asset_id, seq, blob_url, thumbnail_url, byte_size,
  parent_version_id NULL,          -- 리믹스 계보 (B-7)
  source JSONB,                    -- {provider, prompt, params, jobId, cost}
  pipeline JSONB,                  -- 거친 후처리 단계와 게이트 수치
  created_at
  UNIQUE(asset_id, seq)

generation_jobs                    -- 3.1의 상태 머신
  id, user_id, project_id, adapter_id,
  provider_job_id NULL, kind,      -- text_to_mesh | image_to_mesh | texture
                                   -- | rig | retarget | sfx | review
  status, progress, error_class NULL,
  payload JSONB,                   -- 프롬프트·파라미터 (키·시크릿 제외)
  cost_estimate, cost_actual NULL,
  created_at, updated_at

share_links                        -- J-2
  id, token,                       -- 128비트 이상 무작위, UNIQUE
  asset_version_id, created_by, revoked_at NULL,
  view_count, created_at

reports                            -- J절 신고
  id, share_token NULL, asset_id, reporter_contact NULL,
  reason, status,                  -- open | resolved | dismissed
  created_at

byok_keys                          -- I-6 (P2)
  user_id, provider, encrypted_key, last4, created_at
  PRIMARY KEY(user_id, provider)
```

**설계 노트.**

- 모든 자원 행이 처음부터 소유자 컬럼을 갖습니다. P0 개발 단계에서는 고정된 개발 계정 하나로 채우고, 인증(M9)이 붙을 때 스키마 변경 없이 전환합니다.
- `scene_revisions`와 `asset_versions`는 불변(append-only)입니다. 수정은 새 seq를 만들고, 복원(H-9)도 과거 리비전을 복사한 새 리비전입니다.
- lock은 테이블에 두지 않습니다 — 6절 참조.
- 계정 삭제(N-11)는 `deleted_at` 마킹 후 배치 삭제로 cascade합니다. 공개 에셋 처리 방침은 삭제 화면 문구와 함께 확정합니다.

---

## 5. API 계약

`/api/v1` 아래 REST + 작업·협업용 STOMP. **이 표가 클라이언트가 코딩할 대상이며, 프레임워크가 아니라 이 계약에 대고 작성합니다.**

| 그룹 | 엔드포인트 | 요지 |
| --- | --- | --- |
| 인증 | `GET /auth/{provider}/login` → 리다이렉트, `POST /auth/logout`, `GET /me` | 쿠키 세션. `/me`가 잔액 요약 포함 |
| 프로젝트 | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}` | I-7 |
| 씬 | `GET /projects/{id}/revisions`, `POST /projects/{id}/revisions` (blob 업로드 + cause), `GET /revisions/{id}` | H-8·H-9. POST는 `baseSeq`를 요구 — 7절 충돌 규칙 |
| 에셋 | `GET/POST /projects/{id}/assets`, `POST /assets/{id}/versions`, `PATCH /assets/{id}` (이름·visibility) | J-4 |
| 생성 | `POST /generate/{kind}` → `202 {jobId, costEstimate}`, `POST /jobs/{id}/cancel`, `POST /jobs/{id}/retry` | kind는 3.1의 열거형. 어댑터는 서버가 고름 |
| 잡 | `GET /jobs?active=true`, `GET /jobs/{id}` | N-4 복원의 정본 |
| 크레딧 | `GET /credits/ledger`, `GET /credits/balance` | I-2·I-3 |
| 공유 | `POST /assets/{id}/share` → `{token}`, `DELETE /share/{token}`, `GET /share/{token}` (공개, 뷰어 데이터) | J-2·J-3 |
| 갤러리 | `GET /gallery?cursor=` (공개) | J-1 |
| 조수 | `POST /assistant/chat` (SSE 스트림) | F절. 툴 실행은 클라이언트가 수행 |
| 검수 | `POST /reviews` (두 asset_version 지정) | L절 |
| 신고 | `POST /reports` (공개) | J절 |
| 폴백 | `POST /postprocess/uv` (multipart) | H-5 |

**규약.**

- 오류 응답은 항상 `{code, message, retryable, detail?}`이며 `code`가 [[UX]] 오류 문구 사전의 키입니다. 제공자 원문 오류는 로그에만 남기고 응답에 싣지 않습니다.
- 바이너리는 API 응답에 직접 싣지 않고 **서명 URL**(기본 15분 만료)로 전달합니다. 공유 뷰어용 서명 URL은 24시간으로 늘립니다 — 링크를 열어둔 채 재생하는 시간이 길기 때문입니다.
- 페이지네이션은 커서 방식 하나로 통일합니다.
- STOMP 토픽: `/user/queue/jobs`(개인 잡), `/topic/projects/{id}`(협업 — 프레즌스·lock·커맨드), `/topic/projects/{id}/jobs`(프로젝트 잡).

---

## 6. 협업 프로토콜 (K절, P2)

**lock은 DB가 아니라 인스턴스 메모리의 TTL 리스입니다.** 단일 인스턴스 전제(2절 비목표)에서 DB 왕복은 비용만 들고, 서버 재시작 시 lock이 전부 풀리는 것은 버그가 아니라 올바른 동작입니다 — 리스는 원래 만료되는 것입니다.

```
lock 리스:  TTL 30초, 클라이언트 하트비트 10초 간격
획득:      SUBSCRIBE 상태에서 acquire(nodeId) → 성공/거절 응답
해제:      release 또는 하트비트 3회 결손으로 만료
이양(K-5): request(nodeId) → 소유자에게 알림 → grant 시 이전
```

**커맨드 전파(K-4).** lock 보유자가 커맨드를 실행하면 `{cmdId, nodeId, type, payload, baseRevisionSeq}`가 `/topic/projects/{id}`로 브로드캐스트되고, 수신자는 자기 씬에 재생합니다. 전파되는 것은 커맨드이지 씬이 아닙니다. 커맨드에 요구되는 성질 — 직렬화 가능, 결정적 재생 — 은 1단계 커맨드 스택의 완료 조건입니다([[REQUIREMENTS]] 8.3).

**정합성 경계.** lock이 편집 충돌을 막으므로 커맨드 순서 충돌은 노드 단위에서 발생하지 않습니다. 늦게 합류한 참여자는 최신 씬 리비전을 받고 그 이후 커맨드부터 재생합니다. 커맨드 유실이 의심되면(seq 틈) 클라이언트가 리비전 재로드로 복구합니다 — **복잡한 재전송 프로토콜 대신 "다시 읽기"가 폴백입니다.**

---

## 7. 로컬-서버 동기화 (H-1 ↔ H-8)

**편집은 로컬 우선입니다.** 모든 커맨드는 즉시 IndexedDB에 반영되고, 동기화는 뒤따릅니다.

```
업로드 시점:  명시적 저장 / 60초 유휴 autosave / 파이프라인 단계 완료(checkpoint)
업로드 내용:  씬 직렬화 블롭 + baseSeq(마지막으로 알고 있는 서버 seq)
서버 판정:   baseSeq == 최신 seq → 새 리비전 생성
             baseSeq <  최신 seq → 409 충돌
```

**충돌 규칙은 단순하게 갑니다.** 409를 받은 클라이언트는 사용자에게 두 선택지를 보여줍니다 — 서버 최신본을 받아 내 변경을 버리거나, 내 것을 새 리비전으로 강제 저장(서버 최신본은 이력에 남아 H-9로 복구 가능)하거나. **병합은 하지 않습니다.** 이 충돌은 같은 계정의 두 기기가 동시에 편집할 때만 발생하는 드문 경우이고, 협업 시나리오에서는 lock과 커맨드 전파(6절)가 애초에 충돌을 만들지 않습니다. 드문 경우를 위해 3-way 병합을 만드는 것은 비용이 비례하지 않습니다.

오프라인 동안의 변경은 동기화 큐에 쌓이고 재연결 시 위 규칙대로 처리됩니다.

---

## 8. 스토리지

**S3 호환 오브젝트 스토리지**를 씁니다(후보 Cloudflare R2 — 프리 티어 조건과 이그레스 정책은 배포 전 원문 확인, 미확인). 코드가 S3 API에만 의존하므로 제공자 교체가 자유롭습니다.

```
버킷 배치
  assets/{assetId}/{versionSeq}/model.glb
  assets/{assetId}/{versionSeq}/thumb.webp
  audio/{assetId}/{versionSeq}/clip.mp3
  scenes/{projectId}/{revisionSeq}.json.gz
  uploads/{userId}/{uuid}          -- 이미지→3D 입력, 7일 후 수명주기 삭제
```

- 키에 사용자 입력 문자열을 넣지 않습니다 — 경로는 전부 서버 생성 ID입니다.
- 클라이언트 접근은 서명 URL만으로, 버킷은 비공개입니다.
- 로컬 개발은 MinIO 컨테이너로 같은 API를 씁니다.

---

## 9. 배포 토폴로지

```
정적 호스팅(FE)        Cloudflare Pages 또는 Netlify — 에디터·공개 화면 번들
컨테이너(BE) 1개       Spring Boot + Node 런타임 포함 이미지 (자식 프로세스용)
                      후보: Render / Fly.io (미확인 — 요금·슬립 정책 확인 필요)
PostgreSQL            관리형 (Supabase / Neon 등, 자동 백업 포함으로 선택)
오브젝트 스토리지       S3 호환 (8절)
```

- **단일 컨테이너가 전제입니다.** lock 리스와 잡 스케줄러가 인스턴스 메모리에 있습니다. 이것은 성립 조건이 아니라 선택이며, 확장 경로는 12절에 있습니다.
- FE는 정적이므로 서버 배포와 독립적으로 롤백됩니다. API 계약(5절)에 하위 호환을 요구하는 이유입니다.
- 서버 이미지에 Node를 포함하는 것이 H-5의 유일한 배포 요구입니다.
- 데모 A까지(M0–M8)는 배포 없이 로컬에서 개발하고, **배포는 M9(서비스화)의 작업입니다.**

---

## 10. 보안 (N-9의 정본)

| 영역 | 규칙 |
| --- | --- |
| 세션 | HttpOnly+Secure+SameSite=Lax 쿠키, 리프레시 회전. JS가 토큰에 접근 불가 |
| 소유권 | 모든 상태 변경 요청에서 리소스 소유권(또는 project_members 역할)을 서버가 검사. 클라이언트가 보낸 ID를 신뢰하지 않음 |
| 업로드 | 이미지 최대 10MB·GLB 최대 100MB(시작값), MIME가 아니라 매직 바이트로 형식 판정, 이미지는 서버에서 재인코딩 후 저장 |
| 레이트리밋 | 생성 계열: 사용자당 동시 1건 + 시간당 20건(시작값). 가입: IP당 일 5회. 공개 조회: IP당 분당 60회. 초과는 429 + Retry-After |
| 공유 토큰 | 128비트 이상 CSPRNG, 추측 불가. 회수 즉시 무효(서버 판정이므로 캐시 없음) |
| CORS/CSP | API는 프론트 출처만 허용. CSP로 스크립트 출처 제한. 뷰어 iframe 임베드(J-5)는 뷰어 경로만 frame-ancestors 완화 |
| 시크릿 | 제공자 키는 서버 환경변수. BYOK는 저장 시 대칭 암호화(키는 환경변수), 로그·응답에 평문 금지, 표시는 last4만 |
| 로그 | 프롬프트는 로그에 남기되 키·토큰·이메일은 마스킹. 빌드 산출물에 키 문자열이 없음을 CI가 단언 |

---

## 11. 관측성 (N-12의 정본)

- **구조화 로그(JSON) + 요청 ID.** 클라이언트가 `X-Request-Id`를 보내면 이어받고 없으면 생성, 응답에 되돌려줍니다. 사용자가 오류 화면에서 이 ID를 복사해 신고할 수 있습니다.
- **잡 감사 로그.** `generation_jobs`의 상태 전이마다 로그 한 줄 — "이 잡이 왜 실패했나"는 로그 검색만으로 답합니다.
- **비용 재구성.** 월 지출 = `SUM(cost_actual)`. 크레딧 원장과 대조해 검산합니다.
- **헬스체크.** `/healthz`(생존)와 `/readyz`(DB·스토리지 연결)를 분리합니다.
- 오류 수집(Sentry 계열)은 선택 사항으로 M9에서 판단합니다.

---

## 12. 수평 확장 경로 (구현하지 않음, 기록만)

단일 인스턴스 제약이 걸린 지점과 확장 시의 이동처만 남깁니다.

| 지금 인스턴스 메모리에 있는 것 | 확장 시 이동처 |
| --- | --- |
| lock 리스, 프레즌스 | Redis (TTL 키가 리스와 정확히 대응) |
| STOMP 심플 브로커 | 외부 브로커 릴레이 (RabbitMQ 등) |
| 잡 스케줄러·폴링 루프 | DB 기반 잡 클레임(`FOR UPDATE SKIP LOCKED`) 또는 전용 큐 |
| 레이트리밋 카운터 | Redis |

DB와 스토리지는 이미 외부에 있으므로 움직일 것이 없습니다. **이 표가 "단일 인스턴스는 선택이지 구조적 막다름이 아니다"의 근거입니다.**

---

## 13. 공개 전 확인 목록 (미확인 항목 모음)

원문 확인이 필요한 주장들입니다. 확인은 사람이 하고, 결과를 해당 절에 반영합니다.

| # | 확인할 것 | 반영처 |
| --- | --- | --- |
| 1 | Tripo 생성물의 상업적 이용·재배포 권리 — **확인 완료(2026-08-10):** 약관 5.2.2가 Paid User Output에 광범위한 상업권 부여, 학습 미사용 명시. **새로 생긴 실행 항목: 약관 3.2의 사전 서면 승인** — end user 대상 생성 서비스 제공에 필요. M9 초입에 요청하며, 요청 전 조항 원문을 직접 재대조. BYOK가 승인 요건을 우회하는지도 함께 질의 | REQUIREMENTS 7.2·10절, TODO 9단계 |
| 2 | ElevenLabs 생성물의 이용 권리와 환산율 — **부분 확인(2026-08-10):** Creative 요금제 기준 상업 라이선스는 Starter($6/월)부터, Free는 비상업. 환산율 확보(초당 $0.004~0.008). **남은 것: ElevenAPI 탭의 요금·약관** — 서버가 쓰는 API 경로의 과금 방식과 상업 라이선스가 갤러리 재배포를 덮는지 | REQUIREMENTS 7.2·9절 |
| 3 | fal.ai TRELLIS 단가 | REQUIREMENTS 9절 |
| 4 | Cloudflare R2(또는 대안) 프리 티어·이그레스 정책 | 8절 |
| 5 | Render/Fly.io 요금과 슬립 정책 — 슬립되면 잡 폴링이 죽으므로 중요 | 9절 |
| 6 | Google·GitHub OAuth 앱 등록 시 검수 요건 | 2절 |
| 7 | **Tripo 오토리깅·텍스처 생성이 자사 생성물이 아닌 외부 업로드 메시를 받는지** — 수동·임포트 입구(A-11, G-6)가 파이프라인을 끝까지 탈 수 있는지가 여기 걸립니다. **긍정 신호(2026-08-10):** API 가격 페이지의 Model Processing이 "texture, convert, retopology and post-process **any mesh**"를 명시. 남은 것: 리깅(Animation 카테고리)도 업로드 메시를 받는지 API 문서에서 확정 | REQUIREMENTS 4절 서두·C절 |

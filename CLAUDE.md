# CLAUDE.md — web-multiAI-tool

이 파일은 Claude Code가 이 프로젝트에서 작업할 때의 지침이다.

## 프로젝트

**웹 브라우저에서, 텍스트와 이미지로부터 게임 엔진에 바로 넣을 수 있는 3D 에셋을 만드는 멀티모달 AI 에디터.**
메시·텍스처·리깅·애니메이션·효과음을 서로 다른 도구로 나눠 만들지 않고 하나의 타임라인 위에서 함께 만든다.

- 목표는 **포트폴리오 / 기술 증명**. 상용 서비스가 아니다. 평가 기준은 ① 완성도 ② 설명 가능성.
- 상태: **요구사항 정의 완료, 구현 미착수.**

## 문서

| 파일 | 내용 | 언제 읽는가 |
|---|---|---|
| `docs/REQUIREMENTS.md` | **요구사항 정본.** 목적 / 기능 요구사항 A–G / 데이터 스키마 / 스택 / 위험 | 작업 전 항상 |
| `docs/ROADMAP.md` | 1차 범위 밖 설계 — 협업 lock, VLM 검수자 등 | 범위 밖 항목을 물을 때 |
| `docs/web-multiAI-tool.md` | 개요 노트 | 전체를 빠르게 훑을 때 |
| `.local/DECISION_LOG.md` | 판단의 경위, 폐기된 대안, 조사 회수 결과 | "왜 그렇게 정했나"를 물을 때. **추적 제외** |
| `TODO.md` | 전체 작업 목록과 진행 상태 | 진행 상황을 묻거나 갱신할 때 |
| `WORK_ORDER.md` | 지금 할 작업 하나의 실행 계획 | **세션 시작 시 항상** |

**`docs/`는 옵시디언 볼트 `G:\이영호\web-dev\web-multiAI-tool`로의 디렉터리 정션이다.** 파일의 실체는 볼트에만 있고 `docs/`는 그것을 비추는 창일 뿐이다. 어느 쪽 경로로 읽고 써도 같은 파일이므로 사본이 생기지 않는다.

**git은 정션을 평범한 폴더로 취급해 내용물까지 들어간다**(실측 확인). 따라서 `docs/`의 문서는 코드와 같은 저장소에 일반 파일로 커밋되고, 클론한 사람은 정션이 아니라 실제 파일을 받는다.

> `git clean -xdf`는 추적되지 않는 파일을 강제로 지우므로 **볼트 원본에 닿을 수 있다.** `docs/`에 대해 이 명령을 쓰지 않는다. 단, 브랜치 전환으로는 볼트 원본이 지워지지 않는 것을 확인했다.

문서 본문에 이 배치를 적지 않는다 — 문서는 내용만 담는다.

## 작업 진행 규칙

1. 세션을 시작하면 **`WORK_ORDER.md`를 먼저 읽는다.** 지금 할 작업 하나가 거기에 있다.
2. **진행 상태의 정본은 `TODO.md`다.** 상태를 다른 곳에 중복해 적지 않는다.
3. 작업을 끝내면 순서대로 처리한다.
   ① `TODO.md`의 해당 항목을 `[x]`로 바꾸고 완료 기록에 날짜와 한 줄 요약을 남긴다.
   ② `TODO.md`에서 다음 미착수 항목을 골라 `WORK_ORDER.md`를 **새로 쓴다.** 비워두지 않는다.
   ③ 사용자에게 무엇이 끝났고 다음이 무엇인지 한 줄로 보고한다.
4. `WORK_ORDER.md`는 **항상 작업 하나만** 담는다. 목록을 옮겨 적지 않는다.
5. 요구사항이 바뀌면 `docs/REQUIREMENTS.md`를 먼저 고치고 `TODO.md`를 맞춘다. 순서를 뒤집지 않는다.
6. 지시서의 절차가 현장과 맞지 않으면 그대로 따르지 말고 **먼저 알린다.** 지시서는 판단을 대신하지 않는다.

## 완료 조건

> `docs/REQUIREMENTS.md` §1.4의 대표 데모 — 텍스트로 캐릭터 생성 → 자동 리깅 → 모션 적용 → 타격 프레임에 생성한 SFX 바인딩 → Unity 익스포트 후 재생 — 을 브라우저만으로 끊김 없이 시연.

P0 항목이 이 데모를 성립시킨다. P1·P2는 잘라도 데모가 무너지지 않는다.

## 기술 스택 (예정)

```
클라이언트     React 19 + TypeScript + Vite
              @react-three/fiber + drei + leva
              three.js WebGPURenderer (WebGL2 자동 폴백)
              Zustand (씬 그래프 + 커맨드 스택), Web Audio API
브라우저 WASM  glTF-Transform + meshoptimizer + Draco   ← 서버와 코드 공유
              xatlas-three (웹워커) — 실패 시 서버 폴백
서버          Spring Boot (인증 · 메타 · 작업 큐 · WebSocket/STOMP)
외부 API      Tripo · fal.ai TRELLIS · ElevenLabs SFX · Claude(tool calling)
```

기존 `C:/dep/3DCommunity`(React + three.js + Spring Boot STOMP) 자산을 그대로 재사용하는 구성이다.

---

## 반드시 지킬 제약

### 1. 도입 금지 (라이선스)

| 대상 | 사유 |
|---|---|
| **Hunyuan3D 2.x 전 계열** | 라이선스 "Territory" 정의가 **대한민국을 명시적으로 제외**. 상업·비상업 무관, 호스팅 경유도 근거 없음 |
| AudioGen / AudioLDM2 | 가중치가 CC-BY-NC 계열 |
| MoMask / MDM 등 모션 OSS | SMPL·AMASS·HumanML3D 데이터셋 학술 제한 전이 |
| RigNet | 비상업 라이선스 |
| Mixamo 런타임 연동 | 공개 API 없음. 모션 파일 재배포는 약관 위반 |

새 모델·데이터셋을 제안할 때는 **코드와 가중치 라이선스를 각각 확인**한다. 코드가 MIT여도 가중치가 비상업인 사례가 흔하다.

### 2. 후처리 순서를 바꾸지 않는다

```
정리(glTF-Transform) → UV(xatlas) → 리깅(Tripo API) → LOD
```

AI 생성 메시의 토폴로지가 나쁘면 리깅 품질이 함께 무너진다. 리깅 전에 정리·UV를 반드시 통과시킨다.

### 3. glTF의 한계를 전제로 설계한다

- **glTF에는 오디오도 애니메이션 이벤트도 없다.** Khronos 비준 확장에 오디오 부재, `KHR_audio_graph`는 Proposal, `MSFT_audio_emitter`는 three.js 미지원.
- 애니메이션 채널은 translation/rotation/scale/weights뿐이다.
- → **`extras`의 `wmt` 네임스페이스 커스텀 스키마가 유일한 경로** (`docs/REQUIREMENTS.md` §6.2). 표준 확장을 찾아 헤매지 않는다.
- 담을 수 없는 것: IK, 본 컨스트레인트, 머티리얼 노드 그래프, 물리/콜라이더, 스테이트 머신, 커스텀 셰이더. 스키닝은 정점당 4본, 모프 타깃은 런타임 상위 8개.

### 4. 좌표·단위 변환

glTF는 미터 / +Y up / **−Z forward**. Unity는 +Y up / **+Z forward**. FBX는 센티미터.
Unity에 glTF 기본 임포터가 없다 — **glTFast 또는 UnityGLTF가 전제**다.
Unreal(+Z up / 좌수)은 범위 밖. 문의 시 "FBX 경로 권장"으로 답한다.

### 5. 오디오 타이밍

`requestAnimationFrame`에 맞춰 소리를 트리거하지 않는다. **`AudioContext.currentTime` 기반 룩어헤드 스케줄러**(25ms 틱 / 100ms 선행)로 예약하고 렌더 클럭과 분리한다.

### 6. LLM 조수 (tool calling)

- 씬 상태는 **요약 JSON + 개별 상세 질의 + 뷰포트 스크린샷** 3분할로 제공한다. 전체 씬을 통째로 넣지 않는다. (참고: `ahujasid/blender-mcp`)
- 프롬프트 캐싱은 `tools → system → messages` 접두사 일치를 본다. **가변 씬 상태는 마지막 캐시 분기점 이후, messages 끝**에 둔다. 툴 목록 순서는 고정한다.
- 툴 스키마는 `strict: true` + `additionalProperties: false`. 각 툴 설명에 **언제 호출하는지**를 쓴다.
- 조수가 실행한 조작도 커맨드 스택에 기록해 undo 가능해야 한다.

### 7. 시크릿

모든 API 키는 서버 보관. **클라이언트 번들에 포함 금지.** `.env`는 추적 제외되어 있다.

### 8. 에디터 기본기는 차용한다

undo/redo · 씬 직렬화 · 다중 선택 · 카메라 조작은 데모에 보이지 않으면서 개발 기간의 상당분을 소모한다(이 프로젝트 최대 위험).
**three.js 공식 에디터(MIT)의 Command 패턴을 차용한다.** 직접 설계하지 않는다.

---

## 실행 (스캐폴딩 후 갱신)

```bash
# 미정 — 프로젝트 초기화 시 작성
```

# client

React 19 + TypeScript + Vite. 에디터와 공개 화면이 함께 들어 있습니다.

**명령은 저장소 루트에서 돕니다.** 이 폴더로 내려가지 않습니다 — `CLAUDE.md`의 실행 절을 보십시오.

## 배치

```
src/
  editor/            에디터 (로그인 필요)
    viewport/        R3F 뷰포트, 렌더러 선택
  site/              공개 화면 — 갤러리·공유 뷰어 (9단계)
  ui/                디자인 시스템 — 토큰과 공유 컴포넌트
  api/               서버 호출 단일 진입 (2단계)
  export/            glTF 익스포터 (8단계)
public/              Vite 정적 에셋. 공개 "화면"은 src/site/ 다
```

전체 경계와 규칙은 `docs/ARCHITECTURE.md` 1절이 정본이고, 각 폴더의 README에 그 폴더가 지는 제약이 적혀 있습니다.

## 경로 별칭

`@/` → `src/`, `@shared/` → `../shared/`. `vite.config.ts`의 `resolve.alias`와 `tsconfig.app.json`의 `paths`가 짝을 이루므로 **둘 중 하나만 고치면 어긋납니다.**

## 렌더러

`WebGPURenderer`를 쓰고 WebGL2로 폴백합니다. 폴백은 three.js가 처리하고, 이 코드가 하는 일은 **어느 백엔드가 실제로 선택됐는지 확정해 상태 바에 보고**하는 것입니다 — 폴백이 조용히 일어나면 나중에 성능 문제의 원인을 짚을 수 없습니다.

검증용 URL 질의는 `CLAUDE.md`의 실행 절에 있습니다.

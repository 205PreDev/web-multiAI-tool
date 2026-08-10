# shared/postprocess

메시 후처리 모듈. **아직 비어 있으며 4단계에서 채웁니다.**

## 이 폴더의 제약 — 런타임 중립

**여기의 코드는 브라우저 웹워커와 Node 자식 프로세스 양쪽에서 무수정으로 돌아야 합니다.**

- `node:*` 를 import하지 않습니다.
- `window` · `document` · DOM API를 참조하지 않습니다.
- 입력은 `ArrayBuffer` 와 옵션 객체, 출력은 `ArrayBuffer` 와 리포트 객체입니다.
- 파일 경로를 받지 않습니다. 파일을 읽고 쓰는 일은 호출자가 합니다.

이 제약 하나가 서버 런타임 결정을 거의 공짜로 되돌릴 수 있게 만듭니다. 근거는 `docs/DECISIONS.md` D-9에 있습니다.

## 들어올 것

정리(glTF-Transform) · UV 언랩(xatlas) · LOD(meshoptimizer) · 압축(Draco). 순서는 정리 → UV → 리깅 → LOD로 고정이며 바꾸지 않습니다(`docs/REQUIREMENTS.md` C절).

## 검증

이 경로의 변경은 2차 미지 에이전트 검증의 발동 조건입니다(`CLAUDE.md`).

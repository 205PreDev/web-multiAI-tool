# shared/types

클라이언트와 서버가 함께 쓰는 타입. **아직 비어 있으며 2단계에서 채웁니다.**

## 들어올 것

- 생성 작업 상태 DTO — `docs/ARCHITECTURE.md` 3.1절의 상태 머신
- 단가표 — `docs/REQUIREMENTS.md` 9절. 서버가 견적을 계산하고 클라이언트가 표시하므로 값이 한 곳에 있어야 합니다
- WMT 스키마 타입 — `docs/WMT_SCHEMA.md`. 익스포터와 공유 뷰어가 같은 타입을 씁니다

## 규칙

**타입과 상수만 둡니다.** 런타임 로직이 들어오면 그것은 이 폴더가 아니라 `shared/postprocess/` 나 각 앱의 몫입니다.

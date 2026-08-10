# client/src/export — 익스포터

glTF/GLB 내보내기와 `wmt` extras 직렬화, 좌표·단위 변환. **8단계에서 채웁니다.**

## 이 폴더가 지는 계약

**`docs/WMT_SCHEMA.md` 가 정본입니다.** 이 익스포터가 쓴 것을 Unity 임포터(`unity/`)와 공유 뷰어(`client/src/site/`)가 읽습니다. 세 구현체가 서로 다른 시점에 만들어지므로 계약 문서가 유일한 보장입니다.

## 잊기 쉬운 것

- **시각의 정본은 초입니다.** 프레임은 표시용 참고값이며 `time` 과 어긋나면 `time` 이 이깁니다
- glTF는 미터 / +Y up / **−Z forward**, Unity는 +Y up / **+Z forward**, FBX는 센티미터
- `wmt` 영역을 제거해도 모델이 정상 로드되어야 합니다

## 검증

이 경로의 변경은 2차 미지 에이전트 검증의 발동 조건입니다(`CLAUDE.md`). 스키마 왕복 단언 7종은 `docs/WMT_SCHEMA.md` 6절에 있습니다.

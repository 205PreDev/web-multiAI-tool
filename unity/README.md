# unity

Unity 임포터 스크립트. **아직 비어 있으며 8단계에서 채웁니다.**

## 하는 일

glTFast 또는 UnityGLTF가 모델을 가져온 뒤, `extras` 의 `wmt` 영역을 읽어 Unity 기능으로 복원합니다.

1. `audioClips` 를 `AudioClip` 에셋으로 임포트
2. 애니메이션 이벤트를 `AnimationEvent` 로 변환해 `time` 값 그대로 꽂음
3. 이벤트를 받아 소리를 재생하는 리시버 컴포넌트를 프리팹에 부착

계약은 `docs/WMT_SCHEMA.md` 가 정본입니다. **익스포터와 이 임포터는 다른 언어로 다른 시점에 만들어지므로, 양쪽이 같은 것을 읽고 쓴다는 보장이 그 문서에서 나옵니다.**

## 전제

Unity에는 glTF 기본 임포터가 없습니다. glTFast 또는 UnityGLTF가 설치되어 있어야 하며, 이 사실을 사용자 문서에 알립니다.

좌표계 — glTF는 −Z가 정면, Unity는 +Z가 정면입니다. 변환은 익스포터(G-5)가 담당합니다.

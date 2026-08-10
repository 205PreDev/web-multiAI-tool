# 제3자 고지

이 저장소가 외부 프로젝트에서 가져온 것을 적습니다. **가져온 것이 코드인지 설계인지를 구분해서** 적습니다 — 라이선스 의무는 코드에 붙지만, 어디서 배웠는지를 적지 않으면 다음 사람이 같은 것을 처음부터 다시 설계합니다.

---

## three.js editor — MIT

- 출처: https://github.com/mrdoob/three.js — `editor/js/Command.js`, `editor/js/History.js`, `editor/js/commands/`
- 라이선스: MIT (Copyright © 2010-2025 three.js authors)

**가져온 것은 구조입니다.** 커맨드 객체 하나가 한 조작을 담고, `execute` / `undo` 쌍을 가지며, History 스택이 그것을 쌓고 되감는 구성입니다. `CLAUDE.md` 제약 8이 "직접 설계하지 않는다"고 못박은 대상이 이것입니다.

**소스를 그대로 복사한 파일은 없습니다.** 두 가지를 바꿨기 때문입니다.

1. **원본의 커맨드는 `THREE.Object3D` 를 참조로 들고 있는 클래스 인스턴스입니다.** 이 프로젝트의 커맨드는 JSON 으로 오가고 남의 브라우저에서 재생돼야 하므로(협업 K-4) 순수 데이터여야 합니다. 그래서 클래스 대신 `{version, type, payload}` 를, 메서드 대신 레지스트리의 순수 함수를 씁니다.
2. **원본은 씬 그래프로 `Object3D` 트리를 직접 씁니다.** 여기서는 정규화된 평면 데이터를 쓰고 렌더 객체는 R3F 쪽에만 둡니다.

MIT 는 이런 재구현에 고지 의무를 지우지 않지만, 설계를 빌린 사실 자체가 이 프로젝트의 판단 기록이므로 남깁니다.

해당 코드: `client/src/editor/commands/`, `client/src/editor/scene/`

---

## 런타임 의존성

`package.json` 의 의존성 라이선스는 각 패키지에 있습니다. **외부 생성 모델의 코드·가중치 라이선스는 별도 관리 대상**이며 `server/adapters/registry.ts` 에 항목별로 기록합니다 — 규칙은 `CLAUDE.md` 제약 1에 있습니다.

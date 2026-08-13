import { addNode, createNode } from '../commands'
import { KIND_INFO } from '../scene/kindInfo'
import type { Command } from '../commands'
import type { NodeId, NodeKind, SceneState } from '../scene/types'

/**
 * 프리미티브·라이트 추가 (A-11) — 커맨드 하나를 만든다.
 *
 * **UI 가 아니라 여기에 두는 이유는 이 판단이 시험 대상이기 때문이다.** 어디에 붙일지와
 * 어떤 이름을 줄지는 화면 없이도 검사할 수 있고, 화면이 붙은 뒤에는 검사하기 어려워진다.
 */

/**
 * 이름을 겹치지 않게 붙인다 — `박스 1`, `박스 2`.
 *
 * **`씬의 노드 수 + 1` 로 매기지 않는다.** 그러면 지웠다 다시 추가할 때 이미 있는 이름이
 * 다시 나오고, 아웃라이너에서 같은 이름이 둘 보인다. id 는 다르므로 동작은 멀쩡한데
 * 사용자는 어느 쪽을 고르는지 알 수 없다.
 */
export function nextNodeName(scene: SceneState, kind: NodeKind): string {
  const label = KIND_INFO[kind].label
  const taken = new Set(Object.values(scene.nodes).map((node) => node.name))

  for (let index = 1; ; index += 1) {
    const candidate = `${label} ${index}`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * 새 노드를 **선택한 노드 밑에** 넣는다. 선택이 없으면 루트다.
 *
 * three.js 공식 에디터가 같은 규칙을 쓴다. 계층을 만들려고 매번 추가한 뒤 끌어 옮기게 하면
 * 그룹을 쓸 이유가 없어진다.
 */
export function buildAddCommand(
  scene: SceneState,
  kind: NodeKind,
  parentId: NodeId | null,
): Command<'addNode'> {
  const node = createNode(kind, nextNodeName(scene, kind), { transform: KIND_INFO[kind].spawn })
  return addNode(scene, node, parentId)
}

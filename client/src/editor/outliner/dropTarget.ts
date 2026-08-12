import { indexOfNode, isDescendant } from '../scene/mutations'
import type { NodeId, SceneState } from '../scene/types'

/**
 * 아웃라이너 드래그 앤 드롭의 판정 (`docs/UX.md` 3.7절 · A-12의 첫 줄).
 *
 * **화면과 떼어 놓는다.** 여기서 결정하는 것은 "이 드롭이 유효한가"와 "어느 부모의 몇 번째
 * 자리인가" 둘뿐이고, 둘 다 DOM 없이 판정된다. 그리고 이 둘이 틀리면 증상은 화면이 아니라
 * **되돌리기에서 나타난다** — 자리가 한 칸 어긋난 채로 커맨드가 만들어지면 undo 가 원래
 * 자리로 돌아가지 못한다.
 */

export type DropTarget =
  /** 노드 행 위에 떨어뜨림 — 그 노드의 마지막 자식이 된다 */
  | { kind: 'onNode'; nodeId: NodeId }
  /** 행과 행 사이에 떨어뜨림 — 그 부모의 `index` 번째 자리로 들어간다 */
  | { kind: 'gap'; parentId: NodeId | null; index: number }

export type DropCheck = { ok: true } | { ok: false; reason: string }

/** 옮겨진 뒤 노드가 놓일 자리. `null` 이면 제자리라 커맨드를 만들 필요가 없다 */
export interface DropPlacement {
  parentId: NodeId | null
  index: number
}

function targetParentId(target: DropTarget): NodeId | null {
  return target.kind === 'onNode' ? target.nodeId : target.parentId
}

/**
 * 이 드롭이 유효한가.
 *
 * 막는 것은 순환뿐이다 — 노드를 자기 자신이나 자기 자손 밑에 넣으면 씬 그래프가 트리가
 * 아니게 되고, `collectSubtreeIds` 가 영원히 돌게 된다. 문구는 화면에 그대로 나간다.
 */
export function checkDrop(scene: SceneState, dragId: NodeId, target: DropTarget): DropCheck {
  const parentId = targetParentId(target)

  if (parentId === dragId) {
    return { ok: false, reason: '노드를 자기 자신 안으로 옮길 수 없습니다' }
  }

  if (isDescendant(scene, dragId, parentId)) {
    return { ok: false, reason: '노드를 자기 하위 항목 안으로 옮길 수 없습니다' }
  }

  return { ok: true }
}

/**
 * 드롭을 실제 자리로 바꾼다. 유효하지 않거나 제자리면 `null`.
 *
 * ⚠️ **같은 부모 안에서 아래로 옮길 때 자리가 한 칸 밀린다.** 계층 이동은 "떼어냈다가 다시
 * 붙이는" 순서로 일어나므로, 떼어낸 뒤에는 원래 자리 뒤의 형제들이 한 칸씩 당겨진다.
 * 사용자가 가리킨 틈은 **떼어내기 전의** 목록 기준이라 그대로 쓰면 한 칸 아래에 꽂힌다.
 */
export function resolveDrop(
  scene: SceneState,
  dragId: NodeId,
  target: DropTarget,
): DropPlacement | null {
  if (!checkDrop(scene, dragId, target).ok) return null

  const node = scene.nodes[dragId]
  if (!node) return null

  const parentId = targetParentId(target)

  if (target.kind === 'onNode') {
    const siblings = scene.nodes[target.nodeId]?.childIds ?? []
    // 이미 그 부모의 마지막 자식이면 제자리다
    if (node.parentId === target.nodeId && siblings.at(-1) === dragId) return null
    return {
      parentId,
      index: node.parentId === target.nodeId ? siblings.length - 1 : siblings.length,
    }
  }

  const currentIndex = indexOfNode(scene, dragId)
  const sameParent = node.parentId === parentId

  if (sameParent && (target.index === currentIndex || target.index === currentIndex + 1)) {
    return null
  }

  const index = sameParent && currentIndex < target.index ? target.index - 1 : target.index
  return { parentId, index }
}

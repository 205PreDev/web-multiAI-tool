import type { NodeId, SceneNode, SceneState } from './types'

/**
 * 씬 상태를 다루는 불변 헬퍼. 커맨드 정의가 이것만 쓰고 직접 객체를 파헤치지 않는다.
 * 여기 있는 함수는 전부 순수하며 입력 상태를 바꾸지 않는다.
 */

/**
 * **`Object.hasOwn` 이어야 한다.** `state.nodes` 는 평범한 객체라 `nodes['constructor']` 나
 * `nodes['toString']` 이 `Object.prototype` 의 함수를 돌려주고, 함수는 truthy 라서 `if (!node)`
 * 가드를 그냥 통과한다. 밖에서 들어온 커맨드(F-3 · K-4)의 `nodeId` 는 임의의 문자열이므로
 * 이것은 이론이 아니다 — `{"type":"renameNode","payload":{"nodeId":"constructor",…}}` 하나로
 * `kind` 도 `transform` 도 없는 유령 노드가 씬에 들어앉는다.
 */
export function hasNode(state: SceneState, id: NodeId): boolean {
  return Object.hasOwn(state.nodes, id)
}

export function getNode(state: SceneState, id: NodeId): SceneNode {
  if (!hasNode(state, id)) throw new Error(`씬에 없는 노드입니다: ${id}`)
  return state.nodes[id] as SceneNode
}

function siblingsOf(state: SceneState, parentId: NodeId | null): readonly NodeId[] {
  return parentId === null ? state.rootIds : getNode(state, parentId).childIds
}

function withSiblings(
  state: SceneState,
  parentId: NodeId | null,
  next: readonly NodeId[],
): SceneState {
  if (parentId === null) return { ...state, rootIds: next }

  const parent = getNode(state, parentId)
  return {
    ...state,
    nodes: { ...state.nodes, [parentId]: { ...parent, childIds: next } },
  }
}

function insertAt(list: readonly NodeId[], id: NodeId, index: number): readonly NodeId[] {
  const clamped = Math.max(0, Math.min(index, list.length))
  return [...list.slice(0, clamped), id, ...list.slice(clamped)]
}

/** 노드와 그 자손의 id 를 깊이 우선으로 모은다. 부모가 먼저 나온다. */
export function collectSubtreeIds(state: SceneState, rootId: NodeId): NodeId[] {
  const collected: NodeId[] = []
  const pending: NodeId[] = [rootId]

  while (pending.length > 0) {
    const id = pending.shift()
    if (id === undefined) break
    collected.push(id)
    pending.unshift(...getNode(state, id).childIds)
  }

  return collected
}

/**
 * 노드 하나를 지정한 부모의 지정한 위치에 넣는다. 자손은 다루지 않는다.
 *
 * **이미 있는 id 는 거절한다.** 덮어쓰면 `nodes` 는 하나인데 형제 목록에는 같은 id 가 둘
 * 들어가고, 그 상태에서 삭제하면 둘 다 사라지는데 되돌리기 payload 에는 자리가 하나만 적혀
 * 있어 원래 목록을 복원하지 못한다. UI 는 `crypto.randomUUID()` 를 쓰므로 여기 걸릴 일이
 * 없지만, 조수(F-3)와 협업 수신(K-4)은 id 를 직접 실어 보낸다.
 */
export function attachNode(
  state: SceneState,
  node: SceneNode,
  parentId: NodeId | null,
  index: number,
): SceneState {
  if (hasNode(state, node.id)) {
    throw new Error(`이미 씬에 있는 노드 id 입니다: ${node.id}`)
  }

  const placed: SceneNode = { ...node, parentId }
  const withNode: SceneState = { ...state, nodes: { ...state.nodes, [node.id]: placed } }
  const siblings = siblingsOf(withNode, parentId)

  return withSiblings(withNode, parentId, insertAt(siblings, node.id, index))
}

/** 노드와 그 자손을 전부 떼어낸다. */
export function detachSubtree(state: SceneState, rootId: NodeId): SceneState {
  const node = getNode(state, rootId)
  const doomed = new Set(collectSubtreeIds(state, rootId))

  const nodes: Record<NodeId, SceneNode> = {}
  for (const [id, value] of Object.entries(state.nodes)) {
    if (!doomed.has(id)) nodes[id] = value
  }

  const detached: SceneState = { ...state, nodes }
  const siblings = siblingsOf(state, node.parentId).filter((id) => id !== rootId)

  return withSiblings(detached, node.parentId, siblings)
}

/**
 * 뿌리 노드 하나만 떼어낸다. **자손은 `nodes` 에 그대로 남으므로 곧바로 다시 붙여야 한다** —
 * 계층 이동에서만 쓰는 중간 단계이며 이 상태가 스토어까지 나가면 부모 없는 노드가 남는다.
 */
export function detachNodeOnly(state: SceneState, nodeId: NodeId): SceneState {
  const node = getNode(state, nodeId)

  const nodes = { ...state.nodes }
  delete nodes[nodeId]

  const siblings = siblingsOf(state, node.parentId).filter((id) => id !== nodeId)
  return withSiblings({ ...state, nodes }, node.parentId, siblings)
}

/** 형제 목록에서의 위치. 없으면 -1. */
export function indexOfNode(state: SceneState, id: NodeId): number {
  const node = getNode(state, id)
  return siblingsOf(state, node.parentId).indexOf(id)
}

/** `candidateParentId` 가 `nodeId` 의 자손이면 참. 순환 참조를 막는 데 쓴다. */
export function isDescendant(
  state: SceneState,
  nodeId: NodeId,
  candidateParentId: NodeId | null,
): boolean {
  if (candidateParentId === null) return false

  let current: NodeId | null = candidateParentId
  while (current !== null) {
    if (current === nodeId) return true
    current = getNode(state, current).parentId
  }

  return false
}

import type { NodeId, SceneNode, SceneState } from './types'

/**
 * 씬 상태를 다루는 불변 헬퍼. 커맨드 정의가 이것만 쓰고 직접 객체를 파헤치지 않는다.
 * 여기 있는 함수는 전부 순수하며 입력 상태를 바꾸지 않는다.
 */

export function getNode(state: SceneState, id: NodeId): SceneNode {
  const node = state.nodes[id]
  if (!node) throw new Error(`씬에 없는 노드입니다: ${id}`)
  return node
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

/** 노드 하나를 지정한 부모의 지정한 위치에 넣는다. 자손은 다루지 않는다. */
export function attachNode(
  state: SceneState,
  node: SceneNode,
  parentId: NodeId | null,
  index: number,
): SceneState {
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

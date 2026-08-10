import { getNode, indexOfNode, collectSubtreeIds } from '../scene/mutations'
import { IDENTITY_TRANSFORM, type MaterialState, type NodeId, type NodeKind } from '../scene/types'
import type { SceneNode, SceneState, Transform } from '../scene/types'
import type { Command } from './types'

/**
 * 커맨드를 만드는 곳. **현재 상태를 읽는 일은 전부 여기서 끝난다.**
 *
 * 되돌리기에 필요한 이전 값과 새로 만드는 id 를 이 시점에 `payload` 에 박아 넣으므로,
 * 만들어진 커맨드는 순수 데이터가 되고 언제 어디서 적용해도 같은 결과를 낸다.
 * 적용 시점에 값을 읽으면 그 시점의 상태에 따라 결과가 갈라진다.
 */

const DEFAULT_MATERIAL: MaterialState = {
  color: '#c9ced6',
  roughness: 0.5,
  metalness: 0,
}

const MATERIAL_LESS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'group',
  'directionalLight',
  'pointLight',
])

function newNodeId(): NodeId {
  return crypto.randomUUID()
}

export function createNode(
  kind: NodeKind,
  name: string,
  overrides: Partial<Pick<SceneNode, 'transform' | 'material'>> = {},
): SceneNode {
  return {
    id: newNodeId(),
    name,
    kind,
    transform: overrides.transform ?? IDENTITY_TRANSFORM,
    material: MATERIAL_LESS.has(kind) ? undefined : (overrides.material ?? DEFAULT_MATERIAL),
    parentId: null,
    childIds: [],
  }
}

export function addNode(
  state: SceneState,
  node: SceneNode,
  parentId: NodeId | null = null,
  index?: number,
): Command<'addNode'> {
  const siblings = parentId === null ? state.rootIds : getNode(state, parentId).childIds
  return {
    type: 'addNode',
    payload: { node: { ...node, parentId }, parentId, index: index ?? siblings.length },
  }
}

export function removeNode(state: SceneState, nodeId: NodeId): Command<'removeNode'> {
  const node = getNode(state, nodeId)
  const removed = collectSubtreeIds(state, nodeId).map((id) => getNode(state, id))

  return {
    type: 'removeNode',
    payload: {
      removed,
      rootNodeId: nodeId,
      parentId: node.parentId,
      index: indexOfNode(state, nodeId),
    },
  }
}

export function setTransform(
  state: SceneState,
  nodeId: NodeId,
  to: Transform,
): Command<'setTransform'> {
  return { type: 'setTransform', payload: { nodeId, from: getNode(state, nodeId).transform, to } }
}

export function setMaterial(
  state: SceneState,
  nodeId: NodeId,
  to: MaterialState,
): Command<'setMaterial'> {
  const from = getNode(state, nodeId).material
  if (!from) throw new Error(`머티리얼이 없는 노드입니다: ${nodeId}`)

  return { type: 'setMaterial', payload: { nodeId, from, to } }
}

export function renameNode(state: SceneState, nodeId: NodeId, to: string): Command<'renameNode'> {
  return { type: 'renameNode', payload: { nodeId, from: getNode(state, nodeId).name, to } }
}

export function reparentNode(
  state: SceneState,
  nodeId: NodeId,
  parentId: NodeId | null,
  index: number,
): Command<'reparentNode'> {
  const node = getNode(state, nodeId)

  return {
    type: 'reparentNode',
    payload: {
      nodeId,
      from: { parentId: node.parentId, index: indexOfNode(state, nodeId) },
      to: { parentId, index },
    },
  }
}

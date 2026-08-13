import { getNode, indexOfNode, collectSubtreeIds } from '../scene/mutations'
import { IDENTITY_TRANSFORM, type MaterialState, type NodeId, type NodeKind } from '../scene/types'
import type { SceneNode, SceneState, Transform } from '../scene/types'
import { COMMAND_VERSION, type Command } from './types'

/**
 * 커맨드를 만드는 곳. **현재 상태를 읽는 일은 전부 여기서 끝난다.**
 *
 * 되돌리기에 필요한 이전 값과 새로 만드는 id 를 이 시점에 `payload` 에 박아 넣으므로,
 * 만들어진 커맨드는 순수 데이터가 되고 언제 어디서 적용해도 같은 결과를 낸다.
 * 적용 시점에 값을 읽으면 그 시점의 상태에 따라 결과가 갈라진다.
 */

/**
 * 새 노드의 머티리얼. **씬 콘텐츠이므로 디자인 토큰(N-14)의 대상이 아니다** — 이 값은
 * 씬 그래프에 저장되고 glTF 로 나가므로 테마를 따라가면 안 된다. 뷰포트가 머티리얼 없는
 * 노드를 그릴 때도 같은 값을 써야 해서 내보낸다.
 */
export const DEFAULT_MATERIAL: MaterialState = {
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
  const node: SceneNode = {
    id: newNodeId(),
    name,
    kind,
    transform: overrides.transform ?? IDENTITY_TRANSFORM,
    parentId: null,
    childIds: [],
  }

  // 머티리얼이 없는 종류에는 **키 자체를 두지 않는다.** `material: undefined` 로 두면
  // `JSON.stringify` 가 키를 지워, 왕복 전후의 객체가 값은 같은데 모양이 달라진다.
  // 그 차이를 `toEqual` 이 못 보므로 완료 판정 단언이 통과하면서 비대칭이 남는다.
  if (MATERIAL_LESS.has(kind)) return node

  return { ...node, material: overrides.material ?? DEFAULT_MATERIAL }
}

export function addNode(
  state: SceneState,
  node: SceneNode,
  parentId: NodeId | null = null,
  index?: number,
): Command<'addNode'> {
  const siblings = parentId === null ? state.rootIds : getNode(state, parentId).childIds
  return {
    version: COMMAND_VERSION,
    type: 'addNode',
    payload: { node: { ...node, parentId }, parentId, index: index ?? siblings.length },
  }
}

export function removeNode(state: SceneState, nodeId: NodeId): Command<'removeNode'> {
  const node = getNode(state, nodeId)
  const removed = collectSubtreeIds(state, nodeId).map((id) => getNode(state, id))

  return {
    version: COMMAND_VERSION,
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
  return {
    version: COMMAND_VERSION,
    type: 'setTransform',
    payload: { nodeId, from: getNode(state, nodeId).transform, to },
  }
}

export function setMaterial(
  state: SceneState,
  nodeId: NodeId,
  to: MaterialState,
): Command<'setMaterial'> {
  const from = getNode(state, nodeId).material
  if (!from) throw new Error(`머티리얼이 없는 노드입니다: ${nodeId}`)

  return { version: COMMAND_VERSION, type: 'setMaterial', payload: { nodeId, from, to } }
}

export function renameNode(state: SceneState, nodeId: NodeId, to: string): Command<'renameNode'> {
  return {
    version: COMMAND_VERSION,
    type: 'renameNode',
    payload: { nodeId, from: getNode(state, nodeId).name, to },
  }
}

export function reparentNode(
  state: SceneState,
  nodeId: NodeId,
  parentId: NodeId | null,
  index: number,
): Command<'reparentNode'> {
  const node = getNode(state, nodeId)

  return {
    version: COMMAND_VERSION,
    type: 'reparentNode',
    payload: {
      nodeId,
      from: { parentId: node.parentId, index: indexOfNode(state, nodeId) },
      to: { parentId, index },
    },
  }
}

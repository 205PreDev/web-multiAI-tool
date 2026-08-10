import {
  attachNode,
  detachNodeOnly,
  detachSubtree,
  getNode,
  isDescendant,
} from '../scene/mutations'
import type { NodeId, SceneNode, SceneState } from '../scene/types'
import type { CommandDefinition, CommandMap, CommandType } from './types'

function setNode(state: SceneState, node: SceneNode): SceneState {
  return { ...state, nodes: { ...state.nodes, [node.id]: node } }
}

function restoreSubtree(state: SceneState, payload: CommandMap['removeNode']): SceneState {
  // 부모가 먼저 오도록 모아두었으므로 순서대로 붙이면 자식이 붙을 자리가 이미 있다.
  // 뿌리만 원래 위치에 넣고 나머지는 각자의 부모 끝에 붙인다 — 형제 순서는
  // 부모의 childIds 에 이미 담겨 복원되므로 여기서는 자리만 만들면 된다.
  let next = state

  for (const node of payload.removed) {
    const isRoot = node.id === payload.rootNodeId
    const parentId = isRoot ? payload.parentId : node.parentId
    const index = isRoot ? payload.index : Number.MAX_SAFE_INTEGER
    next = attachNode(next, node, parentId, index)
  }

  // 자손의 childIds 를 원본 그대로 되돌린다. attachNode 가 부모 쪽 목록을 끝에 덧붙이는
  // 방식이라 순서가 어긋날 수 있어, 저장해둔 값으로 덮는다.
  for (const node of payload.removed) {
    next = setNode(next, { ...getNode(next, node.id), childIds: node.childIds })
  }

  return next
}

/** 노드를 자손째로 다른 부모 밑으로 옮긴다. 자손은 `nodes` 에 그대로 있으므로 따라온다. */
function moveNode(state: SceneState, nodeId: NodeId, parentId: NodeId | null, index: number) {
  if (isDescendant(state, nodeId, parentId)) {
    throw new Error('노드를 자기 자손 아래로 옮길 수 없습니다')
  }

  const node = getNode(state, nodeId)
  return attachNode(detachNodeOnly(state, nodeId), node, parentId, index)
}

/**
 * 커맨드 타입별 적용·되돌리기 정의.
 *
 * **여기 있는 함수는 전부 순수해야 한다.** 무작위 값도 현재 시각도 만들지 않는다 —
 * 그런 것이 들어오면 협업 상대의 브라우저에서 다른 결과가 나오고, JSON 왕복 후
 * 재생 결과도 달라진다. 필요한 값은 커맨드를 만들 때 `payload` 에 박아 넣는다.
 */
export const COMMANDS: { [T in CommandType]: CommandDefinition<T> } = {
  addNode: {
    apply: (state, { node, parentId, index }) => attachNode(state, node, parentId, index),
    revert: (state, { node }) => detachSubtree(state, node.id),
    describe: ({ node }) => `${node.name} 추가`,
  },

  removeNode: {
    apply: (state, { rootNodeId }) => detachSubtree(state, rootNodeId),
    revert: restoreSubtree,
    describe: ({ removed, rootNodeId }) =>
      `${removed.find((n) => n.id === rootNodeId)?.name ?? '노드'} 삭제`,
  },

  setTransform: {
    apply: (state, { nodeId, to }) => setNode(state, { ...getNode(state, nodeId), transform: to }),
    revert: (state, { nodeId, from }) =>
      setNode(state, { ...getNode(state, nodeId), transform: from }),
    describe: () => '트랜스폼 변경',
  },

  setMaterial: {
    apply: (state, { nodeId, to }) => setNode(state, { ...getNode(state, nodeId), material: to }),
    revert: (state, { nodeId, from }) =>
      setNode(state, { ...getNode(state, nodeId), material: from }),
    describe: () => '머티리얼 변경',
  },

  renameNode: {
    apply: (state, { nodeId, to }) => setNode(state, { ...getNode(state, nodeId), name: to }),
    revert: (state, { nodeId, from }) => setNode(state, { ...getNode(state, nodeId), name: from }),
    describe: ({ to }) => `이름을 ${to} 로 변경`,
  },

  reparentNode: {
    apply: (state, { nodeId, to }) => moveNode(state, nodeId, to.parentId, to.index),
    revert: (state, { nodeId, from }) => moveNode(state, nodeId, from.parentId, from.index),
    describe: () => '계층 이동',
  },
}

export const COMMAND_TYPES = Object.keys(COMMANDS) as CommandType[]

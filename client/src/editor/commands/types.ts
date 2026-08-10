import type { MaterialState, NodeId, SceneNode, SceneState, Transform } from '../scene/types'

/**
 * 커맨드는 **순수 데이터**다. 함수도 클래스 인스턴스도 담지 않는다.
 *
 * 소비자가 셋이기 때문이다.
 *
 * | 소비자 | 요구 |
 * | --- | --- |
 * | undo / redo (A-5) | 되돌릴 수 있어야 함 |
 * | 자연어 조수 (F-3) | 외부에서 만들어 넣을 수 있어야 함 |
 * | 협업 전파 (K-4) | JSON 으로 오가고 남의 브라우저에서 같은 결과를 내야 함 |
 *
 * 셋 중 뒤의 둘이 순수 데이터를 요구한다. 그래서 `payload` 는 **되돌리기에 필요한 이전 값까지
 * 함께** 담는다 — 되돌릴 때 다시 계산하면 계산 시점의 상태에 따라 결과가 갈라진다.
 */
export interface AddNodePayload {
  node: SceneNode
  parentId: NodeId | null
  index: number
}

export interface RemoveNodePayload {
  /** 지운 노드와 그 자손 전부. 되돌릴 때 그대로 되살린다 */
  removed: readonly SceneNode[]
  rootNodeId: NodeId
  parentId: NodeId | null
  index: number
}

export interface SetTransformPayload {
  nodeId: NodeId
  from: Transform
  to: Transform
}

export interface SetMaterialPayload {
  nodeId: NodeId
  from: MaterialState
  to: MaterialState
}

export interface RenameNodePayload {
  nodeId: NodeId
  from: string
  to: string
}

export interface ReparentNodePayload {
  nodeId: NodeId
  from: { parentId: NodeId | null; index: number }
  to: { parentId: NodeId | null; index: number }
}

export interface CommandMap {
  addNode: AddNodePayload
  removeNode: RemoveNodePayload
  setTransform: SetTransformPayload
  setMaterial: SetMaterialPayload
  renameNode: RenameNodePayload
  reparentNode: ReparentNodePayload
}

export type CommandType = keyof CommandMap

export type Command<T extends CommandType = CommandType> = {
  [K in CommandType]: { type: K; payload: CommandMap[K] }
}[T]

/**
 * 적용과 되돌리기는 순수 함수다. 같은 상태에 같은 커맨드를 넣으면 언제나 같은 상태가 나온다.
 * 무작위 값이나 현재 시각을 여기서 만들지 않는다 — 필요한 것은 전부 `payload` 에 있다.
 */
export interface CommandDefinition<T extends CommandType> {
  apply: (state: SceneState, payload: CommandMap[T]) => SceneState
  revert: (state: SceneState, payload: CommandMap[T]) => SceneState
  /** 히스토리 표시와 토스트 문구에 쓴다 */
  describe: (payload: CommandMap[T]) => string
}

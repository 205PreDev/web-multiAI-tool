/**
 * 커맨드 스택의 공개 진입점.
 *
 * **씬을 바꾸는 모든 경로가 여기를 지난다.** 컴포넌트도, 7단계의 자연어 조수도,
 * 10단계의 협업 수신도 마찬가지다. 조수가 자기만의 씬 변경 경로를 가지면 되돌리기가
 * 조용히 무너지므로, 툴 하나가 여기 있는 팩토리 하나에 1:1로 대응하게 만든다.
 */

export type {
  Command,
  CommandType,
  CommandMap,
  AddNodePayload,
  RemoveNodePayload,
  SetTransformPayload,
  SetMaterialPayload,
  RenameNodePayload,
  ReparentNodePayload,
} from './types'

export { COMMAND_TYPES } from './registry'
export { describeCommand, HISTORY_LIMIT } from './history'
export { serializeCommand, parseCommand, validateCommand, CommandParseError } from './serialize'

export {
  createNode,
  addNode,
  removeNode,
  setTransform,
  setMaterial,
  renameNode,
  reparentNode,
} from './factories'

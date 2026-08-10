/**
 * 커맨드를 **만들고 읽는** 도구 모음. 씬을 바꾸는 것은 여기 없다.
 *
 * 씬을 바꾸는 유일한 자리는 `scene/store.ts` 의 `useEditorStore.execute` 와
 * `executeSerialized` 다. 이 파일은 그 둘에 **넣을 것을 만드는 곳**이다.
 *
 * ```
 * 조수(F-3) · 협업 수신(K-4)  ──▶  executeSerialized(raw)   ─┐
 * UI 컴포넌트                 ──▶  execute(팩토리(scene, …)) ─┴─▶  히스토리 · 씬
 * ```
 *
 * **툴 하나가 여기 있는 팩토리 하나에 1:1로 대응한다.** 조수가 자기만의 씬 변경 경로를 가지면
 * 되돌리기가 조용히 무너지므로, 새 조작을 더할 때 만드는 것은 새 경로가 아니라 새 팩토리다.
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

export { COMMAND_VERSION } from './types'
export { COMMAND_TYPES } from './registry'
export { describeCommand, targetNodeId, HISTORY_LIMIT } from './history'
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

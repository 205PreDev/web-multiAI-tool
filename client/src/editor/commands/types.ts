import type { MaterialState, NodeId, SceneNode, SceneState, Transform } from '../scene/types'

/**
 * 커맨드 객체 · `execute`/`undo` 쌍 · History 스택이라는 구성은 **three.js editor(MIT)** 에서
 * 가져왔다 — `editor/js/Command.js`, `editor/js/History.js`, `editor/js/commands/`.
 * 소스를 복사한 것이 아니라 구조를 옮긴 것이며, 무엇을 왜 바꿨는지는 저장소 루트 `NOTICE.md`
 * 에 있다. 요약하면 원본의 커맨드는 `THREE.Object3D` 를 쥔 클래스 인스턴스이고 이쪽은 순수
 * 데이터라는 점이 다르다.
 *
 * ---
 *
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

/**
 * 커맨드 스키마 판. **버전 없이 엄격 검증만 두면 확장이 불가능해진다** — 뒤 단계가 payload 에
 * 필드를 더하는 순간(A-9 머티리얼 슬롯 · 3단계 에셋 참조), 리비전에 남아 있던 옛 커맨드와
 * 협업 상대의 옛 클라이언트를 구버전이라고 말할 방법이 없어 그냥 거절하게 된다. 지금 한 줄이고
 * 나중에는 이미 나간 데이터와의 호환 문제다.
 *
 * `docs/WMT_SCHEMA.md` 가 `extras.wmt` 에 `version` 을 둔 것과 같은 이유이고 같은 규칙이다.
 */
export const COMMAND_VERSION = 1

export type Command<T extends CommandType = CommandType> = {
  [K in CommandType]: { version: typeof COMMAND_VERSION; type: K; payload: CommandMap[K] }
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
  /**
   * 이 커맨드가 건드리는 노드.
   *
   * **정의에 넣어 타입마다 강제한다.** 노드 id 가 payload 안에서 타입마다 다른 자리에 있는데
   * (`node.id` · `rootNodeId` · `nodeId`), 이것을 꺼내는 일이 커맨드 계층 밖에서 필요하다 —
   * 협업 lock 검사(K-3)와 전파 봉투의 `nodeId` 필드(`docs/ARCHITECTURE.md` 6절)가 그것이다.
   * 밖에서 `switch` 로 짜면 커맨드 타입을 더할 때마다 그 `switch` 를 고쳐야 하는데, 고치는
   * 것을 잊어도 컴파일이 통과한다.
   */
  targetNodeId: (payload: CommandMap[T]) => NodeId
  /**
   * 직전 커맨드에 이어붙일 수 있으면 합친 payload 를, 아니면 정의 자체를 두지 않는다.
   *
   * **같은 타입 · 같은 대상 · 짧은 시간차는 `history.ts` 가 이미 확인했다.** 여기서 답할
   * 것은 "무엇을 남기는가"뿐이다 — 대개는 `to` 를 새 값으로, **`from` 은 직전 값을 그대로
   * 유지**한다. `from` 을 최신 값으로 덮으면 되돌리기가 연속 조작의 중간으로 돌아간다.
   *
   * 없는 타입(추가·삭제·이름 변경·계층 이동)은 항상 새 커맨드로 남는다 — 그것들은 조작
   * 하나가 곧 커맨드 하나다.
   */
  merge?: (previous: CommandMap[T], next: CommandMap[T]) => CommandMap[T]
}

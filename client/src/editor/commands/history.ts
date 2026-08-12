import { COMMANDS } from './registry'
import type { Command } from './types'
import type { NodeId, SceneState } from '../scene/types'

/**
 * 실행 취소 스택. **three.js editor(MIT)의 `editor/js/History.js` 구조를 옮긴 것**이며 무엇을
 * 왜 바꿨는지는 저장소 루트 `NOTICE.md` 에 있다.
 *
 * ⚠️ 원본에 있고 여기 아직 없는 것 — **연속 조작 병합.** 기즈모 드래그(A-3)나 인스펙터
 * 슬라이더(A-4)는 프레임마다 `setTransform` 을 만들므로, 병합이 없으면 드래그 한 번이
 * `HISTORY_LIMIT` 을 절반씩 먹고 Ctrl+Z 를 백 번 눌러야 한 동작이 취소된다. 그 둘을 붙이는
 * 지시서에서 함께 넣는다 — 병합 규칙은 "같은 타입 · 같은 대상 · 짧은 시간차"인데, 그것을
 * 판정하려면 실제로 연속 커맨드를 만드는 UI 가 있어야 검증이 된다.
 */
export interface History {
  readonly past: readonly Command[]
  readonly future: readonly Command[]
}

export const EMPTY_HISTORY: History = { past: [], future: [] }

/** 되돌리기 스택이 무한히 자라지 않도록 자른다. 커맨드가 삭제된 서브트리를 통째로 들고 있어 무겁다. */
export const HISTORY_LIMIT = 200

export function applyCommand(state: SceneState, command: Command): SceneState {
  // 타입별 payload 대응은 CommandMap 이 보장하지만 인덱스 접근에서는 좁혀지지 않는다.
  const definition = COMMANDS[command.type] as {
    apply: (state: SceneState, payload: unknown) => SceneState
  }
  return definition.apply(state, command.payload)
}

export function revertCommand(state: SceneState, command: Command): SceneState {
  const definition = COMMANDS[command.type] as {
    revert: (state: SceneState, payload: unknown) => SceneState
  }
  return definition.revert(state, command.payload)
}

export function describeCommand(command: Command): string {
  const definition = COMMANDS[command.type] as { describe: (payload: unknown) => string }
  return definition.describe(command.payload)
}

/**
 * 이 커맨드가 건드리는 노드. 협업 lock 검사(K-3)와 전파 봉투의 `nodeId`
 * (`docs/ARCHITECTURE.md` 6절)가 타입별 분기 없이 이것을 쓴다.
 */
export function targetNodeId(command: Command): NodeId {
  const definition = COMMANDS[command.type] as { targetNodeId: (payload: unknown) => NodeId }
  return definition.targetNodeId(command.payload)
}

export interface HistoryResult {
  scene: SceneState
  history: History
}

/** 새 커맨드를 실행한다. **redo 스택은 버린다** — 갈라진 미래를 들고 있으면 순서가 모호해진다. */
export function pushCommand(scene: SceneState, history: History, command: Command): HistoryResult {
  const next = applyCommand(scene, command)
  const past = [...history.past, command].slice(-HISTORY_LIMIT)

  return { scene: next, history: { past, future: [] } }
}

export function undo(scene: SceneState, history: History): HistoryResult {
  const command = history.past.at(-1)
  if (!command) return { scene, history }

  return {
    scene: revertCommand(scene, command),
    history: { past: history.past.slice(0, -1), future: [command, ...history.future] },
  }
}

export function redo(scene: SceneState, history: History): HistoryResult {
  const [command, ...rest] = history.future
  if (!command) return { scene, history }

  return {
    scene: applyCommand(scene, command),
    history: { past: [...history.past, command], future: rest },
  }
}

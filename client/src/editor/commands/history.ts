import { COMMANDS } from './registry'
import type { Command } from './types'
import type { SceneState } from '../scene/types'

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

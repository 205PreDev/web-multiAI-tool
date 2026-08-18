import { COMMANDS } from './registry'
import type { Command, CommandMap, CommandType } from './types'
import type { NodeId, SceneState } from '../scene/types'

/**
 * 실행 취소 스택. **three.js editor(MIT)의 `editor/js/History.js` 구조를 옮긴 것**이며 무엇을
 * 왜 바꿨는지는 저장소 루트 `NOTICE.md` 에 있다.
 *
 * `lastPushedAt` 은 병합 판정에만 쓴다. **커맨드 payload 에는 넣지 않는다** — 시각이
 * payload 에 들어가면 JSON 왕복 재생이 매번 다른 결과를 낸다. `Command` 는 여전히 순수
 * 데이터이고, 시각은 History(스토어 상태) 쪽에만 산다.
 */
export interface History {
  readonly past: readonly Command[]
  readonly future: readonly Command[]
  readonly lastPushedAt: number | null
}

export const EMPTY_HISTORY: History = { past: [], future: [], lastPushedAt: null }

/**
 * 이 시간(ms) 안에 들어온 같은 타입 · 같은 대상 커맨드는 하나로 합친다.
 *
 * three.js editor `History.js` 가 `updatable` 커맨드에 쓰는 임계값을 그대로 가져왔다 — 이
 * 프로젝트가 값까지 직접 재는 것은 A-3 3차 검증(드래그 한 번이 커맨드 하나만 남기는가)의
 * 몫이고, 여기서는 그 검증이 통과한 값을 남긴다.
 */
export const MERGE_WINDOW_MS = 500

/**
 * 직전 커맨드와 이어붙일 수 있으면 병합한 커맨드를, 아니면 `null` 을 돌려준다.
 *
 * **판정 셋(같은 타입 · 같은 대상 · 짧은 시간차)은 여기서 확인하고, "무엇을 합칠 것인가"는
 * 커맨드 정의의 `merge` 에 맡긴다.** 타입별 분기를 여기 두지 않는다(D-31과 같은 이유) — 새
 * 커맨드 타입이 병합을 원하면 정의에 `merge` 를 추가하는 것으로 끝나야 하고, 이 함수를 고칠
 * 필요가 없어야 한다. `merge` 가 없는 타입(추가·삭제·이름 변경·계층 이동)은 항상 `null`이다.
 */
function tryMerge(previous: Command | undefined, next: Command, elapsedMs: number): Command | null {
  if (!previous) return null
  if (previous.type !== next.type) return null
  if (elapsedMs > MERGE_WINDOW_MS) return null

  const type = next.type as CommandType
  const definition = COMMANDS[type] as {
    merge?: (previous: unknown, next: unknown) => unknown
    targetNodeId: (payload: unknown) => NodeId
  }
  if (!definition.merge) return null

  if (definition.targetNodeId(previous.payload) !== definition.targetNodeId(next.payload)) {
    return null
  }

  return {
    version: next.version,
    type,
    payload: definition.merge(previous.payload, next.payload) as CommandMap[CommandType],
  } as Command
}

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
  /**
   * 이번 push 가 직전 커맨드와 합쳐졌는가. **토스트 억제 판정에 쓴다** — `useCommandRunner`
   * 가 이 값을 보고 병합된 push 에서는 토스트를 띄우지 않는다(`docs/UX.md` 4절, 프레임마다
   * 토스트가 뜨면 안 된다). `undo`/`redo` 는 병합하지 않으므로 항상 `false` 다.
   */
  merged: boolean
}

/**
 * 새 커맨드를 실행한다. **redo 스택은 버린다** — 갈라진 미래를 들고 있으면 순서가 모호해진다.
 *
 * `now` 는 병합 판정에만 쓰고 기본값은 `Date.now()` 다. **테스트가 시간차를 직접 정할 수
 * 있도록 인자로 남겨둔다** — 실제 시계에 기대면 병합 경계(정확히 `MERGE_WINDOW_MS`)를
 * 검사하는 단언이 타이밍에 따라 흔들린다.
 */
export function pushCommand(
  scene: SceneState,
  history: History,
  command: Command,
  now: number = Date.now(),
): HistoryResult {
  const next = applyCommand(scene, command)

  const elapsed = history.lastPushedAt === null ? Infinity : now - history.lastPushedAt
  const mergedCommand = tryMerge(history.past.at(-1), command, elapsed)

  const past = mergedCommand
    ? [...history.past.slice(0, -1), mergedCommand]
    : [...history.past, command].slice(-HISTORY_LIMIT)

  return {
    scene: next,
    history: { past, future: [], lastPushedAt: now },
    merged: mergedCommand !== null,
  }
}

/**
 * 되돌린 뒤 `lastPushedAt` 을 비운다. **비우지 않으면 되돌리기 직후의 새 드래그가 이미 사라진
 * 커맨드 옆자리와 우연히 병합될 여지가 남는다** — past 맨 끝이 바뀌었는데 시각만 그대로면
 * "직전"이 가리키는 대상이 사용자가 되돌린 바로 그것이 아니게 된다.
 */
export function undo(scene: SceneState, history: History): HistoryResult {
  const command = history.past.at(-1)
  if (!command) return { scene, history, merged: false }

  return {
    scene: revertCommand(scene, command),
    history: {
      past: history.past.slice(0, -1),
      future: [command, ...history.future],
      lastPushedAt: null,
    },
    merged: false,
  }
}

/** 같은 이유로 `lastPushedAt` 을 비운다 — `undo` 의 주석 참조 */
export function redo(scene: SceneState, history: History): HistoryResult {
  const [command, ...rest] = history.future
  if (!command) return { scene, history, merged: false }

  return {
    scene: applyCommand(scene, command),
    history: { past: [...history.past, command], future: rest, lastPushedAt: null },
    merged: false,
  }
}

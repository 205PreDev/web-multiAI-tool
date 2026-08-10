import { create } from 'zustand'
import {
  EMPTY_HISTORY,
  redo as redoHistory,
  pushCommand,
  undo as undoHistory,
  type History,
} from '../commands/history'
import { validateCommand } from '../commands/serialize'
import type { Command } from '../commands/types'
import { hasNode } from './mutations'
import { EMPTY_SCENE, type NodeId, type SceneState } from './types'

/**
 * 씬을 바꾸려는 시도의 결과.
 *
 * **던지지 않고 돌려준다.** 씬 조작은 세 곳에서 들어오는데 셋 다 예외를 받을 자리가 없다 —
 * UI 이벤트 핸들러에서 던진 예외는 React 에러 경계에 걸리지 않고, 협업 수신(K-4)은 WebSocket
 * 콜백 안이며, 조수(F-3)는 도구 호출 응답을 값으로 만들어야 한다.
 *
 * 그리고 **여기서 실패하는 것은 버그만이 아니다.** 아웃라이너에서 노드를 자기 자손 위로 끌어다
 * 놓는 것(A-2)은 사용자의 정상적인 조작이고, 그때 필요한 것은 스택 트레이스가 아니라
 * `docs/UX.md` 5절의 문구다.
 */
export type ExecuteResult = { ok: true } | { ok: false; reason: string }

const OK: ExecuteResult = { ok: true }

function failed(error: unknown, context: string): ExecuteResult {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`[editor] ${context}`, error)
  return { ok: false, reason }
}

interface EditorStore {
  scene: SceneState
  history: History
  selectedIds: readonly NodeId[]

  /** **씬을 바꾸는 유일한 경로.** 컴포넌트도 조수도 협업 수신도 전부 여기로 들어온다. */
  execute: (command: Command) => ExecuteResult
  /** 밖(조수 F-3 · 협업 K-4)에서 들어온 것. 모양 검증을 거쳐 execute 로 넘긴다. */
  executeSerialized: (raw: unknown) => ExecuteResult

  undo: () => ExecuteResult
  redo: () => ExecuteResult
  canUndo: () => boolean
  canRedo: () => boolean

  select: (ids: readonly NodeId[]) => void
}

export const useEditorStore = create<EditorStore>((set, get) => {
  /**
   * 사라진 노드가 선택에 남아 있으면 인스펙터가 없는 노드를 읽는다.
   * `in` 이 아니라 `hasNode` 인 이유는 `mutations.ts` 의 `hasNode` 주석에 있다.
   */
  function prune(scene: SceneState, selectedIds: readonly NodeId[]): readonly NodeId[] {
    return selectedIds.filter((id) => hasNode(scene, id))
  }

  return {
    scene: EMPTY_SCENE,
    history: EMPTY_HISTORY,
    selectedIds: [],

    execute: (command) => {
      try {
        set((state) => {
          const result = pushCommand(state.scene, state.history, command)
          return { ...result, selectedIds: prune(result.scene, state.selectedIds) }
        })
        return OK
      } catch (error) {
        return failed(error, '커맨드를 적용하지 못했습니다')
      }
    },

    // 모양 검증(validateCommand)과 적용(execute)의 실패를 함께 받는다. 모양이 맞아도
    // 가리키는 노드가 씬에 없을 수 있고, 그것은 씬을 아는 적용 시점에만 알 수 있다.
    executeSerialized: (raw) => {
      let command: Command
      try {
        command = validateCommand(raw)
      } catch (error) {
        return failed(error, '밖에서 들어온 커맨드를 읽지 못했습니다')
      }
      return get().execute(command)
    },

    undo: () => {
      try {
        set((state) => {
          const result = undoHistory(state.scene, state.history)
          return { ...result, selectedIds: prune(result.scene, state.selectedIds) }
        })
        return OK
      } catch (error) {
        return failed(error, '되돌리지 못했습니다')
      }
    },

    redo: () => {
      try {
        set((state) => {
          const result = redoHistory(state.scene, state.history)
          return { ...result, selectedIds: prune(result.scene, state.selectedIds) }
        })
        return OK
      } catch (error) {
        return failed(error, '다시 실행하지 못했습니다')
      }
    },

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    select: (ids) => set({ selectedIds: ids }),
  }
})

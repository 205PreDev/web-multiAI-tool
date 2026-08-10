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
import { EMPTY_SCENE, type NodeId, type SceneState } from './types'

/**
 * 밖에서 들어온 커맨드의 처리 결과.
 *
 * **던지지 않고 돌려준다.** 협업 수신(K-4)은 WebSocket 콜백에서 돌고 조수(F-3)는 도구 호출
 * 응답을 만들어야 하는데, 둘 다 예외가 올라가면 받을 곳이 없다 — 이벤트 핸들러에서 던진
 * 예외는 React 에러 경계에 걸리지도 않는다. 버전이 어긋난 상대가 보낸 커맨드 하나에
 * 세션이 끊기지 않게 실패를 값으로 만든다.
 */
export type ExecuteResult = { ok: true } | { ok: false; reason: string }

interface EditorStore {
  scene: SceneState
  history: History
  selectedIds: readonly NodeId[]

  /** **씬을 바꾸는 유일한 경로.** 컴포넌트도 조수도 협업 수신도 전부 여기로 들어온다. */
  execute: (command: Command) => void
  /** 외부(조수 F-3 · 협업 K-4)에서 들어온 것. 검증을 거쳐 execute 로 넘긴다. */
  executeSerialized: (raw: unknown) => ExecuteResult

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  select: (ids: readonly NodeId[]) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  scene: EMPTY_SCENE,
  history: EMPTY_HISTORY,
  selectedIds: [],

  execute: (command) =>
    set((state) => {
      const result = pushCommand(state.scene, state.history, command)
      return {
        ...result,
        // 사라진 노드가 선택에 남아 있으면 인스펙터가 없는 노드를 읽는다.
        selectedIds: state.selectedIds.filter((id) => id in result.scene.nodes),
      }
    }),

  // 모양 검증(validateCommand)과 적용(execute)의 실패를 함께 받는다. 모양이 맞아도
  // 가리키는 노드가 씬에 없을 수 있고, 그것은 씬을 아는 적용 시점에만 알 수 있다.
  executeSerialized: (raw) => {
    try {
      get().execute(validateCommand(raw))
      return { ok: true }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error('[editor] 밖에서 들어온 커맨드를 적용하지 못했습니다', error)
      return { ok: false, reason }
    }
  },

  undo: () =>
    set((state) => {
      const result = undoHistory(state.scene, state.history)
      return {
        ...result,
        selectedIds: state.selectedIds.filter((id) => id in result.scene.nodes),
      }
    }),

  redo: () =>
    set((state) => {
      const result = redoHistory(state.scene, state.history)
      return {
        ...result,
        selectedIds: state.selectedIds.filter((id) => id in result.scene.nodes),
      }
    }),

  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,

  select: (ids) => set({ selectedIds: ids }),
}))

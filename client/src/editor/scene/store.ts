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

interface EditorStore {
  scene: SceneState
  history: History
  selectedIds: readonly NodeId[]

  /** **씬을 바꾸는 유일한 경로.** 컴포넌트도 조수도 협업 수신도 전부 여기로 들어온다. */
  execute: (command: Command) => void
  /** 외부(조수 F-3 · 협업 K-4)에서 들어온 것. 검증을 거쳐 execute 로 넘긴다. */
  executeSerialized: (raw: unknown) => void

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

  executeSerialized: (raw) => get().execute(validateCommand(raw)),

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

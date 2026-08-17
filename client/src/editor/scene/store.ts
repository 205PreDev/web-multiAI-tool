import { create } from 'zustand'
import {
  EMPTY_HISTORY,
  redo as redoHistory,
  pushCommand,
  undo as undoHistory,
  type History,
} from '../commands/history'
import { targetNodeId } from '../commands/history'
import { validateCommand } from '../commands/serialize'
import type { Command } from '../commands/types'
import { ancestorIds, hasNode } from './mutations'
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

  /**
   * 아웃라이너에서 접어 둔 노드.
   *
   * **씬 데이터가 아니라 화면 상태이므로 히스토리에 남지 않는다.** 그런데도 컴포넌트가 아니라
   * 여기 있는 이유는 접힘을 푸는 책임이 아래 `revealed` 에 있기 때문이다 — 노드를 씬에 놓는
   * 경로가 아웃라이너 밖에도 있다(단축키 · 앞으로 기즈모 · 조수 F-3 · 협업 K-4).
   */
  collapsedIds: ReadonlySet<NodeId>

  /** **씬을 바꾸는 유일한 경로.** 컴포넌트도 조수도 협업 수신도 전부 여기로 들어온다. */
  execute: (command: Command) => ExecuteResult
  /** 밖(조수 F-3 · 협업 K-4)에서 들어온 것. 모양 검증을 거쳐 execute 로 넘긴다. */
  executeSerialized: (raw: unknown) => ExecuteResult

  undo: () => ExecuteResult
  redo: () => ExecuteResult
  canUndo: () => boolean
  canRedo: () => boolean

  select: (ids: readonly NodeId[]) => void
  toggleCollapse: (id: NodeId) => void
}

export const useEditorStore = create<EditorStore>((set, get) => {
  /**
   * 사라진 노드가 선택에 남아 있으면 인스펙터가 없는 노드를 읽는다.
   * `in` 이 아니라 `hasNode` 인 이유는 `mutations.ts` 의 `hasNode` 주석에 있다.
   */
  function prune(scene: SceneState, selectedIds: readonly NodeId[]): readonly NodeId[] {
    return selectedIds.filter((id) => hasNode(scene, id))
  }

  /**
   * **커맨드가 건드린 노드는 화면에 보인다.**
   *
   * 접힌 그룹 안에 노드가 놓이면 사용자에게는 아무 일도 일어나지 않은 것으로 보인다 —
   * 새로 만든 것이 어디에도 나타나지 않고, 옮긴 것은 사라진 것처럼 보인다. 조작은 성공했고
   * 토스트도 떴으므로 화면과 토스트가 서로 다른 말을 한다.
   *
   * **커맨드마다 따로 처리하지 않고 여기 한 곳에 둔다.** 노드를 씬에 놓는 경로는 지금 셋이고
   * (추가 · 드롭 · Alt+방향키) 기즈모와 조수(F-3) · 협업 수신(K-4)에서 더 늘어난다. 경로마다
   * 적어 두면 새 경로가 그것을 빠뜨려도 아무 검사에 걸리지 않는다. `targetNodeId` 는 그런
   * 용도로 커맨드 정의가 이미 들고 있는 것이다.
   *
   * 조상만 펼친다. 노드 자신이 접혀 있는 것은 자기 행이 보이는 것을 막지 않는다.
   * **바뀐 것이 없으면 같은 Set 을 돌려준다** — 새 Set 을 만들면 아웃라이너가 매번 다시 그린다.
   */
  function revealed(
    scene: SceneState,
    collapsedIds: ReadonlySet<NodeId>,
    nodeId: NodeId,
  ): ReadonlySet<NodeId> {
    if (collapsedIds.size === 0) return collapsedIds

    const hidden = ancestorIds(scene, nodeId).filter((id) => collapsedIds.has(id))
    if (hidden.length === 0) return collapsedIds

    const next = new Set(collapsedIds)
    for (const id of hidden) next.delete(id)
    return next
  }

  return {
    scene: EMPTY_SCENE,
    history: EMPTY_HISTORY,
    selectedIds: [],
    /**
     * 지워진 노드의 id 는 남겨 둔다. 되돌리기가 같은 id 로 되살리므로, 지우는 김에 비우면
     * 되살아난 그룹이 접혀 있던 사실만 사라진다.
     */
    collapsedIds: new Set(),

    execute: (command) => {
      try {
        set((state) => {
          const result = pushCommand(state.scene, state.history, command)
          return {
            ...result,
            selectedIds: prune(result.scene, state.selectedIds),
            collapsedIds: revealed(result.scene, state.collapsedIds, targetNodeId(command)),
          }
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
          // 되돌린 커맨드의 대상도 보여야 한다 — 되살아난 노드가 접힌 그룹 안에 있으면
          // Ctrl+Z 를 눌러도 화면이 그대로다
          const command = state.history.past.at(-1)
          return {
            ...result,
            selectedIds: prune(result.scene, state.selectedIds),
            collapsedIds: command
              ? revealed(result.scene, state.collapsedIds, targetNodeId(command))
              : state.collapsedIds,
          }
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
          const command = state.history.future[0]
          return {
            ...result,
            selectedIds: prune(result.scene, state.selectedIds),
            collapsedIds: command
              ? revealed(result.scene, state.collapsedIds, targetNodeId(command))
              : state.collapsedIds,
          }
        })
        return OK
      } catch (error) {
        return failed(error, '다시 실행하지 못했습니다')
      }
    },

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    /**
     * **입구에서 정리한다.** `select` 는 공개 API 이고 앞으로 조수(F-3)와 협업(K-4)이 부른다.
     *
     * 씬에 없는 id 를 그냥 담아두면 화면마다 다르게 말한다 — 인스펙터는 "찾지 못했습니다",
     * 상태 바는 "선택 없음". 같은 상태를 두 가지로 말하는 것은 사용자가 아니라 코드가
     * 혼란스러운 것이다. 중복도 지운다 — `['a','a']` 가 "외 1개"로 세어진다.
     */
    select: (ids) => set((state) => ({ selectedIds: prune(state.scene, [...new Set(ids)]) })),

    toggleCollapse: (id) =>
      set((state) => {
        const next = new Set(state.collapsedIds)
        if (!next.delete(id)) next.add(id)
        return { collapsedIds: next }
      }),
  }
})

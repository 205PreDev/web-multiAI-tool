import { useEffect } from 'react'
import { removeNode, reparentNode } from './commands'
import { DIRECTION_BY_KEY, planKeyboardMove } from './outliner/keyboardMove'
import { findNode } from './scene/mutations'
import { useEditorStore } from './scene/store'
import { runCommand } from './useCommandRunner'
import { toast } from '../ui/toast'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * 에디터 단축키 (`docs/UX.md` 6절).
 *
 * 입력 중일 때는 가로채지 않는다 — 이름을 고치다 Ctrl+Z 를 누르면 사용자가 기대하는 것은
 * 씬 되돌리기가 아니라 글자 되돌리기이고, Delete 는 더더욱 글자 지우기다.
 *
 * ⚠️ 아직 없는 것 — W/E/R 기즈모 전환(A-3) · F 프레이밍 · Space 재생(5단계) · `?` 목록.
 * 붙는 자리는 여기이며, 커맨드를 만드는 단축키는 `useCommandRunner` 를 거쳐야 한다.
 *
 * **아무 일도 일어나지 않는 경우에도 이유를 말한다.** 단축키는 눌러 봐야 있는지 알 수 있고,
 * 반응이 없으면 사용자는 그것이 "할 수 없는 조작"인지 "고장 난 기능"인지 구분하지 못한다.
 */
export function useEditorShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return

      const store = useEditorStore.getState()

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()

        // Ctrl+Z 는 되돌리기, Ctrl+Shift+Z 와 Ctrl+Y 는 다시 실행
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault()
          store.undo()
        } else if ((key === 'z' && event.shiftKey) || key === 'y') {
          event.preventDefault()
          store.redo()
        }
        return
      }

      /*
       * Alt + 방향키 — 선택한 노드의 계층 이동.
       *
       * **아웃라이너의 행이 아니라 선택을 기준으로 삼는다.** 행에 붙여두면 뷰포트에서 노드를
       * 고른 뒤에는 포커스가 행에 없어 아무 반응이 없고, 사용자에게는 기능이 고장 난 것과
       * 구분되지 않는다. 어디서 골랐든 고른 것이 움직이는 편이 예측 가능하다.
       */
      const direction = event.altKey ? DIRECTION_BY_KEY[event.key] : undefined
      if (direction) {
        // 옮길 수 있든 없든 먼저 막는다 — Alt+←/→ 는 브라우저의 뒤로·앞으로 가기이고,
        // 씬이 메모리에만 있으므로(A-6 미구현) 페이지를 떠나면 작업이 통째로 사라진다
        event.preventDefault()

        const id = store.selectedIds[0]
        if (id === undefined) {
          toast('먼저 옮길 노드를 고르세요', 'danger')
          return
        }

        const plan = planKeyboardMove(store.scene, id, direction)
        if (!plan.ok) {
          toast(plan.reason, 'danger')
          return
        }

        runCommand(reparentNode(store.scene, id, plan.parentId, plan.index))
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        // `removeNode` 는 팩토리라 스토어의 try/catch 밖이다 — 여기서 던지면 받을 곳이 없다.
        // `nodes[id]` 를 직접 보면 `id` 가 `'constructor'` 일 때 가드를 통과한다(`findNode` 주석)
        const id = store.selectedIds[0]
        if (id === undefined || !findNode(store.scene, id)) return

        event.preventDefault()
        runCommand(removeNode(store.scene, id))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

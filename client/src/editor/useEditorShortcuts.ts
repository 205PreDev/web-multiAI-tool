import { useEffect } from 'react'
import { removeNode } from './commands'
import { findNode } from './scene/mutations'
import { useEditorStore } from './scene/store'
import { runCommand } from './useCommandRunner'

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

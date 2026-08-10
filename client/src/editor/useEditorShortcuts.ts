import { useEffect } from 'react'
import { useEditorStore } from './scene/store'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * undo / redo 단축키.
 *
 * 입력 중일 때는 가로채지 않는다 — 이름을 고치다 Ctrl+Z 를 누르면 사용자가 기대하는 것은
 * 씬 되돌리기가 아니라 글자 되돌리기다.
 */
export function useEditorShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return
      if (isTypingTarget(event.target)) return

      const key = event.key.toLowerCase()
      const store = useEditorStore.getState()

      // Ctrl+Z 는 되돌리기, Ctrl+Shift+Z 와 Ctrl+Y 는 다시 실행
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        store.undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        store.redo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

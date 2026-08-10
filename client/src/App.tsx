import { CommandProbe } from './editor/CommandProbe'
import { StatusBar } from './editor/StatusBar'
import { useEditorShortcuts } from './editor/useEditorShortcuts'
import { Viewport } from './editor/viewport/Viewport'
import styles from './App.module.css'

/**
 * 1단계 진행 중의 에디터 골격. 뷰포트와 상태 바, 그리고 커맨드 경로를 확인하는 임시 패널.
 * 아웃라이너·인스펙터·타임라인의 배치는 `docs/UX.md` 2절이 정본이며 다음 지시서에서 채운다.
 */
export function App() {
  // 테마는 index.html 의 <html data-theme> 하나가 정한다. 여기서 다시 박으면
  // 그 값을 가려 [data-theme='light'] 가 앱 안쪽에 영영 닿지 못한다.
  useEditorShortcuts()

  return (
    <div className={styles.shell}>
      <div className={styles.stage}>
        <Viewport />
        <CommandProbe />
      </div>
      <StatusBar />
    </div>
  )
}

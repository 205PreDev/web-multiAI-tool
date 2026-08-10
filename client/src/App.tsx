import { StatusBar } from './editor/StatusBar'
import { Viewport } from './editor/viewport/Viewport'
import styles from './App.module.css'

/**
 * 0단계의 에디터 골격. 뷰포트와 상태 바만 있다.
 * 아웃라이너·인스펙터·타임라인의 배치는 `docs/UX.md` 2절이 정본이며 1단계에서 채운다.
 */
export function App() {
  return (
    <div className={styles.shell} data-theme="dark">
      <Viewport />
      <StatusBar />
    </div>
  )
}

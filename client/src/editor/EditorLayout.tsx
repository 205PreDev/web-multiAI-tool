import type { DragEvent } from 'react'
import { Panel, PanelPlaceholder } from '../ui/Panel'
import { Toaster } from '../ui/Toaster'
import { Outliner } from './outliner/Outliner'
import { Inspector } from './panels/Inspector'
import { PipelineStepper } from './panels/PipelineStepper'
import { StatusBar } from './StatusBar'
import { TopBar } from './TopBar'
import { useEditorShortcuts } from './useEditorShortcuts'
import { Viewport } from './viewport/Viewport'
import styles from './EditorLayout.module.css'

/**
 * 에디터 골격 (`docs/UX.md` 2절).
 *
 * 지금 실제로 동작하는 것은 뷰포트·아웃라이너·상태 바 셋이고 나머지는 자리다.
 * 자리를 지금 세우는 이유는 배분 때문이다 — 타임라인과 오른쪽 패널을 나중에 끼워 넣으면
 * 이미 자리를 잡은 것들의 폭과 높이를 전부 다시 재야 한다.
 */
/**
 * OS 파일을 창 아무 데나 떨어뜨렸을 때 **브라우저가 그 파일로 이동해 버리는 것**을 막는다.
 *
 * 기본 동작이라 아무도 부르지 않아도 일어나고, 지금은 씬이 메모리에만 있으므로
 * (A-6 · H-1 미구현) 그 순간 작업이 통째로 사라진다. 되돌릴 수 없는 손실이다.
 *
 * **`Files` 가 실린 드래그만 막는다.** 아웃라이너의 내부 드래그까지 여기서 받으면 앱 전체가
 * 유효한 드롭 대상이 되어 금지 커서가 사라진다.
 *
 * 이미지·GLB 를 실제로 받는 것은 3단계(B-2)와 8단계(G-6)이며 자리는 `docs/UX.md` 3.7절이다.
 */
function blockFileNavigation(event: DragEvent<HTMLDivElement>) {
  if (!event.dataTransfer.types.includes('Files')) return

  event.preventDefault()
  event.dataTransfer.dropEffect = 'none'
}

export function EditorLayout() {
  // 테마는 index.html 의 <html data-theme> 하나가 정한다. 여기서 다시 박으면
  // 그 값을 가려 [data-theme='light'] 가 앱 안쪽에 영영 닿지 못한다.
  useEditorShortcuts()

  return (
    <div className={styles.shell} onDragOver={blockFileNavigation} onDrop={blockFileNavigation}>
      <TopBar />

      <div className={styles.narrow}>
        <span>이 에디터는 가로 1280px 이상에서 동작합니다.</span>
        <span className={styles.narrowDetail}>
          창을 넓히거나 데스크톱에서 열어주세요. 공유 뷰어와 갤러리는 모바일에서 동작합니다.
        </span>
      </div>

      <div className={styles.body}>
        <aside className={styles.left}>
          <div className={styles.grow}>
            <Outliner />
          </div>
          <div className={styles.fixed}>
            <PipelineStepper />
          </div>
        </aside>

        <main className={styles.center}>
          <div className={styles.stage}>
            <Viewport />
            {/* 토스트는 뷰포트 위에 뜬다. 타임라인까지 아우르는 자리에 두면 패널 안에 갇힌다 */}
            <Toaster />
          </div>

          <div className={styles.timeline}>
            <Panel title="타임라인">
              <PanelPlaceholder
                lines={[
                  '클립 선택 · 재생/정지 · 스크럽 — 5단계 (D-1)',
                  '이벤트 마커 트랙과 오디오 트랙이 같은 시간축에 놓입니다 — 5·6단계',
                ]}
              />
            </Panel>
          </div>
        </main>

        <aside className={styles.right}>
          <div className={styles.grow}>
            <Inspector />
          </div>
          <div className={styles.grow}>
            <Panel title="생성 · 잡 · 조수">
              <PanelPlaceholder
                lines={[
                  '탭 전환 자리 — 셋이 동시에 필요한 순간이 없습니다',
                  '생성 패널 · 잡 카드 — 3단계 (B절)',
                  '조수 채팅 — 7단계 (F절)',
                ]}
              />
            </Panel>
          </div>
        </aside>
      </div>

      <StatusBar />
    </div>
  )
}

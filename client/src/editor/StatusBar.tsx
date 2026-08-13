import { kindLabel } from './scene/kindInfo'
import { findNode } from './scene/mutations'
import { useEditorStore } from './scene/store'
import { useRendererReport, type RendererReport } from './viewport/rendererReport'
import styles from './StatusBar.module.css'

type Tone = 'ok' | 'warn' | 'danger'

interface RendererDescription {
  label: string
  detail: string
  tone: Tone
}

function describeRenderer(report: RendererReport): RendererDescription {
  if (report.status === 'failed') {
    return {
      label: '없음',
      detail: `렌더러를 만들지 못했습니다 — ${report.message}`,
      tone: 'danger',
    }
  }

  if (report.backend === 'webgpu') {
    return { label: 'WebGPU', detail: '이 브라우저가 WebGPU를 지원합니다', tone: 'ok' }
  }

  switch (report.request) {
    case 'force-webgl2':
      return {
        label: 'WebGL2',
        detail: 'URL에서 지정했습니다 — 폴백 경로가 아니라 직접 선택입니다',
        tone: 'warn',
      }
    case 'simulate-no-webgpu':
      return {
        label: 'WebGL2',
        detail: 'WebGPU를 감춘 채 폴백 경로를 태웠습니다',
        tone: 'warn',
      }
    default:
      return {
        label: 'WebGL2',
        detail: report.webgpuExposed
          ? 'WebGPU를 시도했으나 장치를 얻지 못해 폴백했습니다'
          : '이 브라우저에 WebGPU가 없어 폴백했습니다',
        tone: 'warn',
      }
  }
}

const toneClass: Record<Tone, string> = {
  ok: styles.ok ?? '',
  warn: styles.warn ?? '',
  danger: styles.danger ?? '',
}

/**
 * 선택 표시. **하드코딩된 "선택 없음"을 없앤 자리다** — 스토어에 `selectedIds` 와 `select` 가
 * 있었는데 `select` 를 부르는 코드가 저장소에 하나도 없었고, 그래서 여기도 고정 문자열이었다.
 *
 * 여러 개 선택(A-7)은 P1이라 아직 배열의 첫 번째만 읽는다. 개수는 함께 보여준다 —
 * 그 자리가 있다는 것이 나중에 배선을 찾는 단서가 된다.
 */
function useSelectionLabel(): string {
  return useEditorStore((state) => {
    const [first, ...rest] = state.selectedIds
    if (first === undefined) return '선택 없음'

    // `nodes[first]` 를 직접 읽지 않는다 — `mutations.ts` 의 `findNode` 주석 참조
    const node = findNode(state.scene, first)
    if (!node) return '선택 없음'

    const suffix = rest.length > 0 ? ` 외 ${rest.length}개` : ''
    return `${node.name} · ${kindLabel(node.kind)}${suffix}`
  })
}

export function StatusBar() {
  const report = useRendererReport((s) => s.report)
  const renderer = report ? describeRenderer(report) : null
  const selection = useSelectionLabel()

  return (
    <footer className={styles.bar}>
      <span className={styles.slot}>{selection}</span>
      <span className={styles.spacer} />
      <span className={styles.slot}>
        렌더러{' '}
        {renderer ? (
          <>
            <strong className={toneClass[renderer.tone]}>{renderer.label}</strong>
            <span className={styles.detail}>{renderer.detail}</span>
          </>
        ) : (
          <strong className={styles.pending}>준비 중</strong>
        )}
      </span>
    </footer>
  )
}

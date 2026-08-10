import { useRendererReport, type RendererReport } from './viewport/rendererReport'
import styles from './StatusBar.module.css'

type Tone = 'ok' | 'warn'

interface RendererDescription {
  label: string
  detail: string
  tone: Tone
}

function describeRenderer(report: RendererReport): RendererDescription {
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

export function StatusBar() {
  const report = useRendererReport((s) => s.report)
  const renderer = report ? describeRenderer(report) : null

  return (
    <footer className={styles.bar}>
      <span className={styles.slot}>선택 없음</span>
      <span className={styles.spacer} />
      <span className={styles.slot}>
        렌더러{' '}
        {renderer ? (
          <>
            <strong className={renderer.tone === 'ok' ? styles.ok : styles.warn}>
              {renderer.label}
            </strong>
            <span className={styles.detail}>{renderer.detail}</span>
          </>
        ) : (
          <strong className={styles.pending}>준비 중</strong>
        )}
      </span>
    </footer>
  )
}

import { Panel } from '../../ui/Panel'
import styles from './PipelineStepper.module.css'

/**
 * 파이프라인 스테퍼의 **자리** (`docs/UX.md` 2.1절).
 *
 * 아직 상태를 나르지 않는다 — 각 단계의 판정은 3~8단계에서 생긴다. 지금 세워두는 이유는
 * **이 순서가 UI 의 강제 장치이기 때문이다.** 후처리 순서 고정(제약 2)은 문서의 규칙이지만
 * 사용자가 그것을 겪는 자리는 여기이고, 나중에 끼워 넣으면 왼쪽 패널의 배분을 다시 짜야 한다.
 */

const STEPS = [
  { label: '생성', stage: '3단계' },
  { label: '정리', stage: '4단계' },
  { label: 'UV', stage: '4단계' },
  { label: '리깅', stage: '4단계' },
  { label: '모션', stage: '5단계' },
  { label: '사운드', stage: '6단계' },
  { label: '익스포트', stage: '8단계' },
] as const

export function PipelineStepper() {
  return (
    <Panel title="파이프라인">
      <ol className={styles.list}>
        {STEPS.map((step, index) => (
          <li key={step.label} className={styles.step}>
            <span className={styles.ordinal}>{index + 1}</span>
            {step.label}
            <span className={styles.state}>미완 · {step.stage}</span>
          </li>
        ))}
      </ol>
      <p className={styles.note}>앞 단계를 통과해야 다음 단계가 열립니다.</p>
    </Panel>
  )
}

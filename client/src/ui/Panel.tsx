import type { ReactNode } from 'react'
import styles from './Panel.module.css'

/**
 * 제목 줄이 붙은 패널. 아웃라이너·인스펙터·타임라인이 같은 껍데기를 쓴다 (N-14).
 */
export function Panel({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}

/**
 * **아직 만들지 않은 자리.** `docs/UX.md` 2절의 배치를 지금 세워두는 이유는, 나중에 끼워
 * 넣으면 이미 자리를 잡은 것들을 다시 밀어내야 하기 때문이다.
 *
 * 자리에는 **무엇이 올 자리인지와 몇 단계인지를 적는다.** 빈 상자만 두면 다음 회차가
 * 그것을 미완성으로 볼지 버그로 볼지 알 수 없다.
 */
export function PanelPlaceholder({ lines }: { lines: readonly string[] }) {
  return (
    <div className={styles.placeholder}>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  )
}

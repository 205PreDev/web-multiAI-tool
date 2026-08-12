import styles from './TopBar.module.css'

/**
 * 상단 바 (`docs/UX.md` 2절) — 프로젝트명 · 동기화 상태 · 크레딧 · 계정.
 *
 * **넷 중 셋이 아직 없다.** 동기화 상태는 H-1/H-8, 크레딧은 I-2, 계정은 I-1이다.
 * 그래서 **없는 것을 있는 것처럼 그리지 않는다** — 자리만 두고 무엇을 기다리는 자리인지 적는다.
 * 가짜 잔액이나 가짜 "저장됨"은 자기 자신을 속이는 화면이고, 그것을 보고 다음 회차가
 * "이미 되어 있다"고 판단한다.
 */
export function TopBar() {
  return (
    <header className={styles.bar}>
      <span className={styles.brand}>web-multiAI-tool</span>
      <span className={styles.project}>이름 없는 프로젝트</span>

      <span className={styles.spacer} />

      <span className={styles.slot} title="씬 저장은 A-6 · H-1에서 붙습니다">
        저장 없음 · 1단계
      </span>
      <span className={styles.slot} title="크레딧 원장은 I-2에서 붙습니다">
        크레딧 —
      </span>
      <span className={styles.slot} title="로그인은 I-1에서 붙습니다">
        계정 —
      </span>
    </header>
  )
}

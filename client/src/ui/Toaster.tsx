import { useToastStore } from './toast'
import styles from './Toaster.module.css'

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)

  return (
    // 스크린리더가 조작 흐름을 끊지 않도록 polite. 오류도 차단이 아니라 알림이다.
    //
    // **비어 있어도 컨테이너를 지우지 않는다.** live region 은 내용이 바뀌기 전부터 DOM 에
    // 있어야 변화가 통지되는데, 목록이 빌 때마다 언마운트하면 매번 "첫 토스트"가 되어
    // 아무것도 읽히지 않는다. 토스트는 `docs/UX.md` 4절이 정한 대로 조수(F-3)가 무엇을
    // 했는지 확인하는 수단이므로 이 채널이 비시각 사용자에게 닿아야 한다.
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[styles.toast, toast.tone === 'danger' ? styles.danger : '']
            .filter(Boolean)
            .join(' ')}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}

import { create } from 'zustand'

/**
 * 토스트 (`docs/UX.md` 4절 · 3.7절).
 *
 * 두 가지를 말한다.
 * 1. **무엇을 했는지와 되돌리는 법** — "이동됨 · Ctrl+Z로 되돌리기". 조수(F-3)가 실행한
 *    커맨드도 같은 토스트를 쓴다. 사용자가 조수의 행동을 화면에서 확인하는 수단이 이것뿐이다.
 * 2. **왜 안 됐는지** — 아웃라이너에서 노드를 자기 자손 위에 떨어뜨리는 것은 사용자의 정상
 *    조작이고, 그때 아무 일도 안 일어나면 사용자는 도구가 고장 났다고 읽는다.
 */

export type ToastTone = 'info' | 'danger'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

/** 성공 알림은 짧게 스쳐야 한다 (UX 4절이 정한 값). 실패는 읽을 시간이 필요하다 */
const DURATION: Record<ToastTone, number> = { info: 1500, danger: 4000 }

/** 화면을 덮지 않도록 최근 것만 남긴다 */
const MAX_VISIBLE = 3

interface ToastStore {
  toasts: readonly Toast[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push: (message, tone = 'info') => {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }].slice(-MAX_VISIBLE) }))

    // 타이머는 스토어가 들고 있다. 컴포넌트에 두면 목록이 줄어들며 언마운트될 때
    // 아직 살아 있어야 할 토스트의 타이머까지 함께 정리된다.
    setTimeout(() => get().dismiss(id), DURATION[tone])
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

export function toast(message: string, tone: ToastTone = 'info'): void {
  useToastStore.getState().push(message, tone)
}

import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { KIND_INFO } from '../scene/kindInfo'
import { NODE_KINDS, type NodeKind } from '../scene/types'
import styles from './Outliner.module.css'

/**
 * 프리미티브·라이트 추가 메뉴 (A-11).
 *
 * `docs/UX.md` 3.1절이 말하는 **"빈 개체로 시작"** 입구다 — 세 입구(AI 생성 · 수동 · 불러오기)
 * 중 두 번째이고, 지금 저장소에서 씬에 무언가를 만들 수 있는 유일한 경로다.
 */

const GROUP_ORDER: { group: KindInfoGroup; label: string }[] = [
  { group: 'primitive', label: '프리미티브' },
  { group: 'light', label: '라이트' },
  { group: 'container', label: '묶음' },
]

type KindInfoGroup = (typeof KIND_INFO)[NodeKind]['group']

export function AddMenu({
  targetName,
  onAdd,
}: {
  /** 어디에 붙는지. 선택이 없으면 `null` 이고 그때는 루트에 붙는다 */
  targetName: string | null
  onAdd: (kind: NodeKind) => void
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)

  // 바깥을 누르거나 Esc 를 누르면 닫는다. 메뉴가 열린 채로 남으면 뷰포트를 가린다
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={styles.menuAnchor} ref={anchor}>
      <Button size="sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        추가 ▾
      </Button>

      {open ? (
        <div className={styles.menu} role="menu">
          <div className={styles.menuTarget}>
            {targetName === null ? '씬 최상위에 추가' : `${targetName} 안에 추가`}
          </div>

          {GROUP_ORDER.map(({ group, label }) => (
            <div key={group}>
              <div className={styles.menuLabel}>{label}</div>
              {NODE_KINDS.filter((kind) => KIND_INFO[kind].group === group).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    onAdd(kind)
                    setOpen(false)
                  }}
                >
                  <span aria-hidden>{KIND_INFO[kind].glyph}</span>
                  {KIND_INFO[kind].label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

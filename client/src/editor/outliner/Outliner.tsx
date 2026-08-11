import { useRef, useState, type DragEvent } from 'react'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { toast } from '../../ui/toast'
import { removeNode, renameNode, reparentNode } from '../commands'
import { KIND_INFO } from '../scene/kindInfo'
import { findNode } from '../scene/mutations'
import { useEditorStore } from '../scene/store'
import { useCommandRunner } from '../useCommandRunner'
import { AddMenu } from './AddMenu'
import { buildAddCommand } from './addSpec'
import { checkDrop, resolveDrop, type DropTarget } from './dropTarget'
import type { NodeId, NodeKind, SceneState } from '../scene/types'
import styles from './Outliner.module.css'

/**
 * 씬 그래프 아웃라이너 (A-2).
 *
 * **커맨드의 첫 실제 소비자다.** 여기서 일어나는 이름 변경·삭제·계층 이동은 전부
 * `useCommandRunner` 를 거치므로 Ctrl+Z 가 따라오고, 같은 커맨드가 나중에 조수(F-3)와
 * 협업 전파(K-4)에서 다시 쓰인다. 이 컴포넌트가 스토어를 직접 고치는 자리는 선택뿐이며,
 * 선택은 씬 데이터가 아니라 화면 상태라 히스토리에 남지 않는다.
 */

interface Row {
  id: NodeId
  depth: number
  parentId: NodeId | null
  /** 형제 목록에서의 자리. 이 행 위의 틈이 가리키는 index 와 같다 */
  index: number
}

const INDENT_PX = 12

/** 접힌 노드의 자손은 화면에 없으므로 행도 만들지 않는다 */
function flatten(scene: SceneState, collapsed: ReadonlySet<NodeId>): Row[] {
  const rows: Row[] = []

  function walk(ids: readonly NodeId[], depth: number, parentId: NodeId | null) {
    ids.forEach((id, index) => {
      rows.push({ id, depth, parentId, index })
      if (collapsed.has(id)) return
      walk(scene.nodes[id]?.childIds ?? [], depth + 1, id)
    })
  }

  walk(scene.rootIds, 0, null)
  return rows
}

function sameTarget(a: DropTarget | null, b: DropTarget): boolean {
  if (a === null || a.kind !== b.kind) return false
  if (a.kind === 'onNode' && b.kind === 'onNode') return a.nodeId === b.nodeId
  if (a.kind === 'gap' && b.kind === 'gap') return a.parentId === b.parentId && a.index === b.index
  return false
}

/**
 * 행과 행 사이의 드롭 자리.
 *
 * **컴포넌트를 `Outliner` 안에 두지 않는다.** 안에 두면 렌더마다 새 컴포넌트 타입이 되어
 * React 가 매번 다시 마운트하는데, 드래그 도중에 마운트가 바뀌면 브라우저가 드래그를 놓친다.
 */
function DropGap({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
}) {
  return (
    <div
      className={[styles.gap, active ? styles.gapActive : ''].filter(Boolean).join(' ')}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  )
}

export function Outliner() {
  const scene = useEditorStore((state) => state.scene)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const select = useEditorStore((state) => state.select)
  const run = useCommandRunner()

  const [collapsed, setCollapsed] = useState<ReadonlySet<NodeId>>(() => new Set())
  const [renamingId, setRenamingId] = useState<NodeId | null>(null)
  const [dragId, setDragId] = useState<NodeId | null>(null)
  const [hover, setHover] = useState<DropTarget | null>(null)

  /**
   * 마지막으로 지나간 자리가 거절이었다면 그 사유.
   *
   * **여기서 바로 말하지 않는 것이 핵심이다.** `dragover` 는 커서 밑의 요소마다 발생하는데,
   * 노드를 집어 드는 순간 커서 밑에 있는 것은 드래그 원천 자신의 행이다 — 그 자리에서 곧바로
   * 토스트를 띄우면 **아직 아무 데도 놓지 않았는데 "자기 자신 안으로 옮길 수 없습니다"가
   * 뜬다.** 자손 행을 스쳐 지나가기만 해도 마찬가지다.
   *
   * `docs/UX.md` 3.7절은 역할을 나눠 두었다 — **지나가는 중에는 금지 커서, 놓았을 때 토스트.**
   * 그래서 사유를 들고만 있다가 `dragend` 에서 실제로 거절된 것이 확인되면 그때 말한다.
   */
  const rejection = useRef<string | null>(null)

  const rows = flatten(scene, collapsed)
  const selectedId = selectedIds[0] ?? null
  const selectedNode = selectedId === null ? null : findNode(scene, selectedId)

  function toggleCollapse(id: NodeId) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function endDrag() {
    setDragId(null)
    setHover(null)
    rejection.current = null
  }

  /**
   * 드래그가 끝났다.
   *
   * **여기가 "드롭 실패"를 말할 수 있는 유일한 자리다.** 유효하지 않은 자리에서는 아래처럼
   * `preventDefault` 를 하지 않아 브라우저가 금지 커서를 보여주는데, 그 대가로 **그 자리에서는
   * `drop` 이 발생하지 않는다.** `dropEffect === 'none'` 은 어느 대상도 드롭을 받지 않았다는
   * 뜻이고, 그때 마지막으로 지나간 자리가 거절이었다면 그것이 사용자가 시도한 것이다.
   * 이 처리가 없으면 `docs/UX.md` 3.7절이 금지한 "조용한 무시"가 된다.
   */
  function handleDragEnd(event: DragEvent) {
    if (event.dataTransfer.dropEffect === 'none' && rejection.current) {
      toast(rejection.current, 'danger')
    }
    endDrag()
  }

  /**
   * 유효하지 않은 자리에서는 `preventDefault` 하지 않는다 — 그래야 브라우저가 금지 커서를
   * 보여준다. 사유는 말하지 않고 들고만 있는다(`rejection` 주석 참조).
   *
   * 표시선(`hover`)은 함께 거둔다. 남겨두면 커서는 금지인데 화면은 "여기에 놓입니다"라고
   * 말하는, 서로 어긋나는 두 신호가 된다.
   */
  function handleDragOver(event: DragEvent, target: DropTarget) {
    if (dragId === null) return

    const check = checkDrop(scene, dragId, target)
    if (!check.ok) {
      rejection.current = check.reason
      if (hover !== null) setHover(null)
      return
    }

    rejection.current = null
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!sameTarget(hover, target)) setHover(target)
  }

  /** 트리 밖으로 나가면 표시선도 사유도 거둔다 — 나간 자리는 시도한 자리가 아니다 */
  function handleDragLeaveTree(event: DragEvent) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    rejection.current = null
    setHover(null)
  }

  function handleDrop(event: DragEvent, target: DropTarget) {
    event.preventDefault()
    if (dragId === null) return

    // 여기 오는 것은 `handleDragOver` 를 통과한 자리뿐이다. 그래도 다시 보는 이유는
    // 씬이 그 사이에 바뀔 수 있기 때문이고(협업 K-4), 그때는 `run()` 이 사유를 말한다.
    const placement = resolveDrop(scene, dragId, target)

    // 제자리에 떨어뜨린 것은 실패가 아니라 아무 일도 아니다 — 히스토리에 남기지 않는다
    if (placement) run(reparentNode(scene, dragId, placement.parentId, placement.index))
    endDrag()
  }

  function commitRename(id: NodeId, value: string) {
    const current = scene.nodes[id]
    setRenamingId(null)

    const name = value.trim()
    if (!current || name === '' || name === current.name) return
    run(renameNode(scene, id, name))
  }

  function addKind(kind: NodeKind) {
    const parentId = selectedNode?.id ?? null

    // 접어둔 그룹 안에 추가하면 방금 만든 것이 화면에 나타나지 않는다
    if (parentId !== null) {
      setCollapsed((current) => new Set([...current].filter((id) => id !== parentId)))
    }

    run(buildAddCommand(scene, kind, parentId))
  }

  return (
    <Panel
      title="아웃라이너"
      actions={<AddMenu targetName={selectedNode?.name ?? null} onAdd={addKind} />}
    >
      <div className={styles.tree} onDragLeave={handleDragLeaveTree}>
        {rows.length === 0 ? (
          // `docs/UX.md` 4절은 이 자리를 3.1절의 중앙 프롬프트에 맡겼는데 그것은 3단계다.
          // 그때까지는 세 입구 중 지금 있는 하나(A-11)를 가리킨다.
          <p className={styles.empty}>
            <span>씬이 비어 있습니다.</span>
            <span>위의 &ldquo;추가&rdquo;로 프리미티브나 라이트를 놓아보세요.</span>
          </p>
        ) : (
          rows.map((row) => {
            const node = scene.nodes[row.id]
            if (!node) return null

            const info = KIND_INFO[node.kind]
            const isSelected = selectedIds.includes(row.id)
            const isCollapsed = collapsed.has(row.id)

            const gapTarget: DropTarget = { kind: 'gap', parentId: row.parentId, index: row.index }
            const intoTarget: DropTarget = { kind: 'onNode', nodeId: row.id }

            return (
              <div key={row.id}>
                <DropGap
                  active={dragId !== null && sameTarget(hover, gapTarget)}
                  onDragOver={(event) => handleDragOver(event, gapTarget)}
                  onDrop={(event) => handleDrop(event, gapTarget)}
                />

                <div
                  className={[
                    styles.row,
                    isSelected ? styles.selected : '',
                    dragId === row.id ? styles.dragging : '',
                    dragId !== null && sameTarget(hover, intoTarget) ? styles.intoTarget : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={renamingId !== row.id}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    // 실어둘 것이 없어도 형식은 채운다 — 비어 있으면 시작조차 않는 브라우저가 있다
                    event.dataTransfer.setData('text/plain', row.id)
                    rejection.current = null
                    setDragId(row.id)
                  }}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOver(event, intoTarget)}
                  onDrop={(event) => handleDrop(event, intoTarget)}
                >
                  <span className={styles.indent} style={{ width: row.depth * INDENT_PX }} />

                  {node.childIds.length > 0 ? (
                    <button
                      type="button"
                      className={styles.twisty}
                      aria-label={isCollapsed ? '펼치기' : '접기'}
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleCollapse(row.id)}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                  ) : (
                    <span className={styles.twisty} />
                  )}

                  <span className={styles.glyph} aria-hidden>
                    {info.glyph}
                  </span>

                  {renamingId === row.id ? (
                    <input
                      className={styles.rename}
                      defaultValue={node.name}
                      autoFocus
                      aria-label="이름"
                      onBlur={(event) => commitRename(row.id, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        // Enter 는 blur 를 타고 커밋으로, Escape 는 커밋 없이 빠져나간다
                        if (event.key === 'Enter') event.currentTarget.blur()
                        else if (event.key === 'Escape') setRenamingId(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.name}
                      aria-current={isSelected}
                      title="누르면 선택 · 두 번 누르면 이름 변경(F2) · Alt+방향키로 계층 이동"
                      onClick={() => select([row.id])}
                      onDoubleClick={() => setRenamingId(row.id)}
                      // **포커스가 곧 선택이다.** Tab 으로 행을 오갈 때 선택이 따라오지 않으면,
                      // 선택을 기준으로 도는 단축키(Alt+방향키 · Delete)가 키보드만 쓰는
                      // 사용자에게는 닿지 않는다 — 고르는 방법이 클릭뿐이 된다.
                      onFocus={() => {
                        if (!isSelected) select([row.id])
                      }}
                      onKeyDown={(event) => {
                        // 계층 이동(Alt+방향키)은 여기 없다. 선택을 기준으로 창 전체에서
                        // 처리하므로 `useEditorShortcuts` 에 있다
                        if (event.key === 'F2') setRenamingId(row.id)
                      }}
                    >
                      {node.name}
                    </button>
                  )}

                  <span className={styles.kind}>{info.label}</span>

                  <span className={styles.trailing}>
                    <Button
                      size="icon"
                      variant="danger"
                      aria-label={`${node.name} 삭제`}
                      onClick={() => run(removeNode(scene, row.id))}
                    >
                      ✕
                    </Button>
                  </span>
                </div>
              </div>
            )
          })
        )}

        {/* 마지막 틈 — 이것이 없으면 노드를 씬 최상위의 끝으로 꺼낼 수 없다 */}
        {rows.length > 0 ? (
          <DropGap
            active={
              dragId !== null &&
              sameTarget(hover, { kind: 'gap', parentId: null, index: scene.rootIds.length })
            }
            onDragOver={(event) =>
              handleDragOver(event, { kind: 'gap', parentId: null, index: scene.rootIds.length })
            }
            onDrop={(event) =>
              handleDrop(event, { kind: 'gap', parentId: null, index: scene.rootIds.length })
            }
          />
        ) : null}
      </div>
    </Panel>
  )
}

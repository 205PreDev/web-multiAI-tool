import { useEffect, useRef, useState, type DragEvent } from 'react'
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
 * 협업 전파(K-4)에서 다시 쓰인다. 이 컴포넌트가 스토어를 직접 고치는 것은 선택과 접힘뿐이며,
 * 둘 다 씬 데이터가 아니라 화면 상태라 히스토리에 남지 않는다.
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
  /**
   * **접힘이 스토어에 있는 이유는 접힘을 푸는 쪽이 여기가 아니기 때문이다.** 노드를 씬에 놓는
   * 경로는 아웃라이너 밖에도 있고(Alt+방향키 · 앞으로 기즈모와 조수), 놓인 노드가 접힌 그룹
   * 안이면 화면에 나타나지 않는다. 그 처리는 커맨드가 지나가는 자리에 한 번만 둔다
   * (`store.ts` 의 `revealed`).
   */
  const collapsed = useEditorStore((state) => state.collapsedIds)
  const toggleCollapse = useEditorStore((state) => state.toggleCollapse)
  const run = useCommandRunner()

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

  /** 트리 밖을 지나갔는지 판정하는 데 쓴다 */
  const treeRef = useRef<HTMLDivElement>(null)

  /**
   * 트리 밖을 지나가면 사유를 거둔다 — 나간 자리는 시도한 자리가 아니다.
   *
   * **`dragleave` 로는 이것을 알 수 없다.** 드래그가 끝날 때 브라우저는 `dragend` 를 보내기
   * 직전에 마지막 대상에게 `dragleave` 를 한 번 더 보낸다. 그래서 `dragleave` 에서 사유를
   * 거두면 **거절된 자리에 놓은 바로 그 순간의 사유가 함께 지워지고**, 금지 커서는 떴는데
   * 놓아도 아무 말이 없는 상태가 된다. 실제로 그랬다.
   *
   * `dragover` 는 반대로 놓는 순간에는 오지 않는다. 사용자가 실제로 밖으로 지나갈 때만
   * 오므로 "나갔다"의 신호로 쓸 수 있다. 창 전체에서 받는 이유는 트리 밖 요소의 이벤트가
   * 트리로 올라오지 않기 때문이다.
   */
  useEffect(() => {
    function onDragOverAnywhere(event: Event) {
      const tree = treeRef.current
      if (tree && !tree.contains(event.target as Node | null)) rejection.current = null
    }

    // **드래그 중에만 걸지 않는다.** 드래그가 시작된 렌더의 이펙트가 도는 시점과 첫
    // `dragover` 가 오는 시점의 앞뒤가 보장되지 않는다. `dragover` 는 드래그 중에만
    // 발생하므로 걸어두는 값이 사실상 없다
    window.addEventListener('dragover', onDragOverAnywhere)
    return () => window.removeEventListener('dragover', onDragOverAnywhere)
  }, [])

  const rows = flatten(scene, collapsed)

  /** 목록의 맨 끝. 마지막 틈과 트리의 빈 아래쪽이 함께 가리킨다 */
  const rootEndTarget: DropTarget = { kind: 'gap', parentId: null, index: scene.rootIds.length }
  const selectedId = selectedIds[0] ?? null
  const selectedNode = selectedId === null ? null : findNode(scene, selectedId)

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
   * `drop` 이 발생하지 않는다.** 이 처리가 없으면 `docs/UX.md` 3.7절이 금지한 "조용한 무시"가
   * 된다.
   *
   * **사유가 남아 있다는 것 자체가 조건이다.** 사유는 세 자리에서 지워진다 — 유효한 자리를
   * 지나갈 때, 트리 밖을 지나갈 때, 그리고 드롭이 성사돼 `endDrag` 가 도는 자리. 셋 중 어느
   * 것도 일어나지 않은 채 드래그가 끝났다면 사용자가 마지막으로 시도한 것은 거절된 자리다.
   */
  function handleDragEnd() {
    if (rejection.current) toast(rejection.current, 'danger')
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

  /**
   * 트리 밖으로 나가면 표시선을 거둔다. **사유는 여기서 거두지 않는다** — 위 `useEffect` 주석에
   * 있듯 이 이벤트는 드래그가 끝나는 순간에도 한 번 더 오기 때문이다.
   */
  function handleDragLeaveTree(event: DragEvent) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
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

  /**
   * 목록 아래의 빈 자리.
   *
   * **여기를 비워두면 두 가지가 잘못된다.** 노드를 루트 끝으로 빼려고 목록 아래 빈 곳에 놓는
   * 것은 사용자가 먼저 시도하는 동작인데 아무 일도 일어나지 않고(UX 3.7절이 금지한 조용한
   * 무시), 오는 길에 거절된 행을 스쳤다면 그 사유가 남아 있다가 **놓은 적도 없는 자리의
   * 사유로 토스트에 뜬다.** 빈 자리를 마지막 틈과 같은 자리로 등록해 둘을 함께 닫는다.
   *
   * 행에서 올라온 이벤트는 그 행이 이미 처리했으므로 걸러낸다. 걸러내지 않으면 버블링을 타고
   * 여기까지 와서 행이 정한 자리를 루트 끝으로 덮어쓴다.
   */
  function handleTreeDragOver(event: DragEvent) {
    if (event.target !== event.currentTarget) return
    handleDragOver(event, rootEndTarget)
  }

  function handleTreeDrop(event: DragEvent) {
    if (event.target !== event.currentTarget) return
    handleDrop(event, rootEndTarget)
  }

  function commitRename(id: NodeId, value: string) {
    const current = scene.nodes[id]
    setRenamingId(null)

    const name = value.trim()
    if (!current || name === '' || name === current.name) return
    run(renameNode(scene, id, name))
  }

  function addKind(kind: NodeKind) {
    run(buildAddCommand(scene, kind, selectedNode?.id ?? null))
  }

  return (
    <Panel
      title="아웃라이너"
      actions={<AddMenu targetName={selectedNode?.name ?? null} onAdd={addKind} />}
    >
      <div
        className={styles.tree}
        ref={treeRef}
        onDragLeave={handleDragLeaveTree}
        onDragOver={handleTreeDragOver}
        onDrop={handleTreeDrop}
      >
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
            active={dragId !== null && sameTarget(hover, rootEndTarget)}
            onDragOver={(event) => handleDragOver(event, rootEndTarget)}
            onDrop={(event) => handleDrop(event, rootEndTarget)}
          />
        ) : null}
      </div>
    </Panel>
  )
}

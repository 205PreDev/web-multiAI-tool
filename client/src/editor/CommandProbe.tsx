import { addNode, createNode, removeNode, setMaterial, setTransform } from './commands'
import { useEditorStore } from './scene/store'
import styles from './CommandProbe.module.css'

/**
 * 커맨드 경로가 실제로 도는지 확인하는 임시 패널.
 *
 * **아웃라이너(A-2)·기즈모(A-3)·인스펙터(A-4)가 들어오면 지운다.** 이 지시서의 범위는
 * 커맨드와 스토어까지이고, 그것이 동작하는 것을 눈으로 보려면 조작 지점이 하나는 있어야 한다.
 */

const PALETTE = ['#e07a5f', '#81b29a', '#f2cc8f', '#6c8ebf', '#b57edc']

export function CommandProbe() {
  const execute = useEditorStore((state) => state.execute)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const scene = useEditorStore((state) => state.scene)
  const past = useEditorStore((state) => state.history.past)
  const future = useEditorStore((state) => state.history.future)

  const nodeIds = scene.rootIds
  const lastId = nodeIds.at(-1)

  return (
    <aside className={styles.panel}>
      <div className={styles.row}>
        <button
          type="button"
          onClick={() => {
            const index = Object.keys(scene.nodes).length
            const node = createNode('box', `박스 ${index + 1}`, {
              transform: {
                position: [(index % 5) - 2, 0.5, Math.floor(index / 5)],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
              },
              material: {
                color: PALETTE[index % PALETTE.length] ?? '#c9ced6',
                roughness: 0.45,
                metalness: 0.05,
              },
            })
            execute(addNode(scene, node))
          }}
        >
          박스 추가
        </button>

        <button
          type="button"
          disabled={!lastId}
          onClick={() => lastId && execute(removeNode(scene, lastId))}
        >
          마지막 삭제
        </button>

        <button
          type="button"
          disabled={!lastId}
          onClick={() => {
            if (!lastId) return
            const current = scene.nodes[lastId]
            if (!current) return
            execute(
              setTransform(scene, lastId, {
                ...current.transform,
                position: [
                  current.transform.position[0],
                  current.transform.position[1] + 0.5,
                  current.transform.position[2],
                ],
              }),
            )
          }}
        >
          위로
        </button>

        <button
          type="button"
          disabled={!lastId || !scene.nodes[lastId]?.material}
          onClick={() => {
            if (!lastId) return
            const current = scene.nodes[lastId]?.material
            if (!current) return
            const next = PALETTE[(PALETTE.indexOf(current.color) + 1) % PALETTE.length]
            execute(setMaterial(scene, lastId, { ...current, color: next ?? current.color }))
          }}
        >
          색 변경
        </button>
      </div>

      <div className={styles.row}>
        <button type="button" disabled={past.length === 0} onClick={undo}>
          되돌리기 ({past.length})
        </button>
        <button type="button" disabled={future.length === 0} onClick={redo}>
          다시 실행 ({future.length})
        </button>
        <span className={styles.hint}>Ctrl+Z · Ctrl+Shift+Z</span>
      </div>
    </aside>
  )
}

import { Panel, PanelPlaceholder } from '../../ui/Panel'
import { kindLabel } from '../scene/kindInfo'
import { findNode } from '../scene/mutations'
import { useEditorStore } from '../scene/store'
import type { Vec3 } from '../scene/types'
import styles from './Inspector.module.css'

/**
 * 인스펙터의 **자리** (A-4).
 *
 * 편집은 다음 지시서다 — 트랜스폼 편집은 연속 조작 병합과 함께 들어와야 하고, 병합 없이
 * 슬라이더를 붙이면 드래그 한 번이 히스토리를 다 먹는다(`commands/history.ts` 의 ⚠️).
 *
 * **그래서 지금은 읽기만 한다.** 값을 아예 안 보여주면 선택이 뷰포트에 닿았는지 확인할
 * 수단이 아웃라이너의 배경색 하나뿐이 된다.
 */

function formatVec(value: Vec3): string {
  return value.map((component) => component.toFixed(2)).join(', ')
}

export function Inspector() {
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const node = useEditorStore((state) => {
    const id = state.selectedIds[0]
    return id === undefined ? null : findNode(state.scene, id)
  })

  return (
    <Panel title="인스펙터">
      {node === null ? (
        <PanelPlaceholder
          lines={[
            selectedIds.length === 0
              ? '선택한 노드가 없습니다.'
              : '선택한 노드를 씬에서 찾지 못했습니다.',
            '아웃라이너나 뷰포트에서 노드를 고르세요.',
          ]}
        />
      ) : (
        <div className={styles.body}>
          <div className={styles.field}>
            <span className={styles.label}>이름</span>
            <span className={styles.value}>{node.name}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>종류</span>
            <span className={styles.value}>{kindLabel(node.kind)}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>위치</span>
            <span className={styles.value}>{formatVec(node.transform.position)}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>회전</span>
            <span className={styles.value}>{formatVec(node.transform.rotation)}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>크기</span>
            <span className={styles.value}>{formatVec(node.transform.scale)}</span>
          </div>

          {node.material ? (
            <div className={styles.field}>
              <span className={styles.label}>머티리얼</span>
              <span className={styles.value}>
                {/* 씬 콘텐츠의 색이라 토큰의 대상이 아니다 — `client/src/ui/README.md` */}
                <span className={styles.swatch} style={{ backgroundColor: node.material.color }} />
                {node.material.color}
              </span>
            </div>
          ) : null}

          <p className={styles.note}>편집은 기즈모·인스펙터 작업(A-3 · A-4)에서 열립니다.</p>
        </div>
      )}
    </Panel>
  )
}

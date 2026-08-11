import { findNode, indexOfNode } from '../scene/mutations'
import type { NodeId, SceneState } from '../scene/types'

/**
 * 키보드로 계층을 옮기는 판정 (Alt + 방향키).
 *
 * **드래그가 유일한 경로면 마우스를 쓸 수 없는 사용자에게 계층 이동이 없는 것과 같다.**
 * `docs/UX.md` 6절이 "전체 키보드 도달"을 접근성 기준선으로 잡았다.
 *
 * ⚠️ **"옮길 수 없음"을 `null` 로 돌려주지 않는다.** 한 줄로 이어진 계층 — 박스 밑에 구,
 * 구 밑에 원기둥 — 에서는 네 방향 중 셋이 할 일이 없다. 형제가 없으면 위아래로 바꿀 상대가
 * 없고, 위에 형제가 없으면 들어갈 곳이 없다. 그 셋을 조용히 넘기면 사용자에게는 **"눌렀는데
 * 아무 일도 안 난다"** 로만 보이고, 기능이 고장 난 것과 구분되지 않는다. 그래서 사유를 함께
 * 돌려주고 화면이 그것을 말한다 — 드롭 거절(`dropTarget.ts`)과 같은 규칙이다.
 */

export type MoveDirection = 'up' | 'down' | 'out' | 'in'

export const DIRECTION_BY_KEY: Readonly<Record<string, MoveDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'out',
  ArrowRight: 'in',
}

export type MovePlan =
  { ok: true; parentId: NodeId | null; index: number } | { ok: false; reason: string }

/**
 * 자리 계산의 기준은 드롭과 같다 — **떼어낸 뒤의 형제 목록.** 계층 이동은 "떼어냈다가 다시
 * 붙이는" 순서로 일어나므로, 떼어낸 뒤에는 원래 자리 뒤의 형제들이 한 칸씩 당겨진다.
 */
export function planKeyboardMove(
  scene: SceneState,
  nodeId: NodeId,
  direction: MoveDirection,
): MovePlan {
  const node = findNode(scene, nodeId)
  if (!node) return { ok: false, reason: '옮길 노드를 찾지 못했습니다' }

  const index = indexOfNode(scene, nodeId)
  const siblings =
    node.parentId === null ? scene.rootIds : (findNode(scene, node.parentId)?.childIds ?? [])

  switch (direction) {
    case 'up':
      if (index <= 0) return { ok: false, reason: '위에 형제가 없어 더 올릴 수 없습니다' }
      return { ok: true, parentId: node.parentId, index: index - 1 }

    case 'down':
      if (index >= siblings.length - 1) {
        return { ok: false, reason: '아래에 형제가 없어 더 내릴 수 없습니다' }
      }
      // 떼어내면 다음 형제가 한 칸 당겨지므로 "그 뒤"는 index + 1 이다
      return { ok: true, parentId: node.parentId, index: index + 1 }

    case 'out': {
      if (node.parentId === null) return { ok: false, reason: '이미 최상위 항목입니다' }
      const parent = findNode(scene, node.parentId)
      return {
        ok: true,
        parentId: parent?.parentId ?? null,
        index: indexOfNode(scene, node.parentId) + 1,
      }
    }

    case 'in': {
      const previousId = siblings[index - 1]
      if (index <= 0 || previousId === undefined) {
        return { ok: false, reason: '바로 위 형제가 없어 안으로 넣을 수 없습니다' }
      }
      return {
        ok: true,
        parentId: previousId,
        index: findNode(scene, previousId)?.childIds.length ?? 0,
      }
    }
  }
}

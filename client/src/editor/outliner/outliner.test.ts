import { describe, expect, it } from 'vitest'
import {
  createNode,
  addNode,
  removeNode,
  renameNode,
  reparentNode,
  serializeCommand,
  parseCommand,
} from '../commands'
import { applyCommand, EMPTY_HISTORY, revertCommand } from '../commands/history'
import { useEditorStore } from '../scene/store'
import { EMPTY_SCENE, type NodeId, type NodeKind, type SceneState } from '../scene/types'
import { buildAddCommand, nextNodeName } from './addSpec'
import { checkDrop, resolveDrop } from './dropTarget'
import { DIRECTION_BY_KEY, planKeyboardMove } from './keyboardMove'
import type { Command } from '../commands'

/**
 * 아웃라이너(A-2)와 추가 메뉴(A-11)가 만들어내는 판단을 화면 없이 검사한다.
 *
 * **화면을 거치지 않고 검사할 수 있게 두 조각을 UI 밖으로 뺀 것이 이 파일의 전제다** —
 * 드롭 자리 계산(`dropTarget.ts`)과 추가 규칙(`addSpec.ts`). 둘 다 틀렸을 때의 증상이
 * 화면이 아니라 **되돌리기**에서 나타나므로, 눈으로 보는 검증(3차)으로는 잡히지 않는다.
 */

function add(state: SceneState, kind: NodeKind, name: string, parentId: NodeId | null) {
  const node = createNode(kind, name, {})
  const command = addNode(state, node, parentId)
  return { state: applyCommand(state, command), id: node.id, command }
}

/** `그룹 A > [박스 1, 박스 2]`, `박스 3` 세 노드 + 그룹 하나 */
function fixture() {
  const a = add(EMPTY_SCENE, 'group', '그룹 A', null)
  const b1 = add(a.state, 'box', '박스 1', a.id)
  const b2 = add(b1.state, 'box', '박스 2', a.id)
  const b3 = add(b2.state, 'box', '박스 3', null)

  return { scene: b3.state, groupId: a.id, box1: b1.id, box2: b2.id, box3: b3.id }
}

describe('드롭 판정 — 순환', () => {
  it('자기 자신 안으로는 옮길 수 없다', () => {
    const { scene, groupId } = fixture()
    const check = checkDrop(scene, groupId, { kind: 'onNode', nodeId: groupId })

    expect(check.ok).toBe(false)
    expect(resolveDrop(scene, groupId, { kind: 'onNode', nodeId: groupId })).toBeNull()
  })

  it('자기 자손 안으로는 옮길 수 없다', () => {
    const { scene, groupId, box1 } = fixture()

    expect(checkDrop(scene, groupId, { kind: 'onNode', nodeId: box1 }).ok).toBe(false)
    expect(checkDrop(scene, groupId, { kind: 'gap', parentId: box1, index: 0 }).ok).toBe(false)
  })

  it('막는 이유를 문구로 돌려준다', () => {
    // 이 문구가 그대로 토스트에 나간다 (UX 3.7절) — 조용한 실패를 만들지 않는다
    const { scene, groupId, box1 } = fixture()
    const check = checkDrop(scene, groupId, { kind: 'onNode', nodeId: box1 })

    expect(check.ok === false && check.reason.length > 0).toBe(true)
  })

  it('막지 않아야 할 것은 막지 않는다', () => {
    // 검사가 전부 false 를 돌려주면 위의 단언은 전부 통과한다
    const { scene, box3, groupId } = fixture()
    expect(checkDrop(scene, box3, { kind: 'onNode', nodeId: groupId }).ok).toBe(true)
  })
})

describe('드롭 판정 — 자리', () => {
  it('노드 위에 떨어뜨리면 그 노드의 마지막 자식이 된다', () => {
    const { scene, groupId, box3 } = fixture()
    expect(resolveDrop(scene, box3, { kind: 'onNode', nodeId: groupId })).toStrictEqual({
      parentId: groupId,
      index: 2,
    })
  })

  /**
   * **같은 부모 위에 떨어뜨리는 분기.** 위의 단언은 다른 부모에서 들어오는 경우만 태우고,
   * 제자리 판정은 그 앞에서 `null` 로 끝나 여기까지 오지 않는다. 그래서 "이미 이 부모의
   * 자식이지만 마지막은 아닌" 경우가 검사 밖에 있었다.
   *
   * 자리 보정이 필요한 이유는 틈에 떨어뜨릴 때와 같다 — 떼어낸 뒤의 형제 목록이 기준이라
   * 마지막 자리는 `siblings.length` 가 아니라 `siblings.length - 1` 이다. 보정을 빠뜨리면
   * 자리를 벗어난 index 가 되어 `moveNode` 가 거절하고, 사용자에게는 **자기 부모 위로는
   * 드롭이 안 되는 것**으로 보인다.
   */
  it('이미 그 부모의 자식이면 마지막 자리로 보정한다', () => {
    const { scene, groupId, box1, box2 } = fixture()

    expect(resolveDrop(scene, box1, { kind: 'onNode', nodeId: groupId })).toStrictEqual({
      parentId: groupId,
      index: 1,
    })

    // 숫자만으로는 그 자리가 유효한지 알 수 없다 — 커맨드를 실제로 태운다
    const placement = resolveDrop(scene, box1, { kind: 'onNode', nodeId: groupId })
    if (!placement) throw new Error('자리를 얻지 못했습니다')

    const command = reparentNode(scene, box1, placement.parentId, placement.index)
    const moved = applyCommand(scene, command)

    expect(moved.nodes[groupId]?.childIds).toStrictEqual([box2, box1])
    expect(revertCommand(moved, command)).toStrictEqual(scene)
  })

  it('제자리에 떨어뜨린 것은 커맨드를 만들지 않는다', () => {
    const { scene, groupId, box2, box3 } = fixture()

    // 이미 그 부모의 마지막 자식
    expect(resolveDrop(scene, box2, { kind: 'onNode', nodeId: groupId })).toBeNull()
    // 자기 앞의 틈과 자기 뒤의 틈은 둘 다 제자리다
    expect(resolveDrop(scene, box3, { kind: 'gap', parentId: null, index: 1 })).toBeNull()
    expect(resolveDrop(scene, box3, { kind: 'gap', parentId: null, index: 2 })).toBeNull()
  })

  it('같은 부모 안에서 아래로 옮기면 자리가 한 칸 당겨진다', () => {
    // 떼어낸 뒤 다시 붙이므로 뒤의 형제들이 한 칸씩 앞으로 온다.
    // 이것을 보정하지 않으면 사용자가 가리킨 곳보다 한 칸 아래에 꽂힌다
    const { scene, groupId, box1 } = fixture()

    expect(resolveDrop(scene, box1, { kind: 'gap', parentId: groupId, index: 2 })).toStrictEqual({
      parentId: groupId,
      index: 1,
    })
  })

  it('위로 옮길 때는 보정하지 않는다', () => {
    const { scene, groupId, box2 } = fixture()

    expect(resolveDrop(scene, box2, { kind: 'gap', parentId: groupId, index: 0 })).toStrictEqual({
      parentId: groupId,
      index: 0,
    })
  })

  it('보정한 자리가 실제로 사용자가 가리킨 곳이다', () => {
    // 위의 단언들은 숫자만 본다. 그 숫자가 맞는 자리인지는 커맨드를 실제로 태워야 안다
    const { scene, groupId, box1, box2 } = fixture()
    const placement = resolveDrop(scene, box1, { kind: 'gap', parentId: groupId, index: 2 })
    if (!placement) throw new Error('자리를 얻지 못했습니다')

    const command = reparentNode(scene, box1, placement.parentId, placement.index)
    const moved = applyCommand(scene, command)

    expect(moved.nodes[groupId]?.childIds).toStrictEqual([box2, box1])

    // **되돌리기까지 태운다.** 자리 보정은 이 파일에서 가장 틀리기 쉬운 계산인데, apply 만
    // 보면 "가리킨 곳에 놓였다"만 확인하고 "원래 자리로 돌아온다"는 확인하지 않는다
    expect(revertCommand(moved, command)).toStrictEqual(scene)
  })

  it('자리를 벗어난 계층 이동은 거절한다', () => {
    // 조용히 끝에 붙이면 형제가 줄어든 씬에서 재생했을 때 다른 결과가 나온다.
    // 커맨드는 같은 결과를 내거나 아무 일도 하지 않아야 한다
    const { scene, groupId, box3 } = fixture()

    expect(() => applyCommand(scene, reparentNode(scene, box3, groupId, 9))).toThrow()
    expect(() => applyCommand(scene, reparentNode(scene, box3, groupId, -1))).toThrow()

    // 끝에 붙이는 것은 유효하다 — 위의 단언이 정상 경로까지 막고 있으면 안 된다
    expect(() => applyCommand(scene, reparentNode(scene, box3, groupId, 2))).not.toThrow()
  })
})

describe('키보드 계층 이동 (Alt + 방향키)', () => {
  /** 사용자가 실제로 만든 모양 — 박스 밑에 구, 구 밑에 원기둥. 형제가 하나도 없다 */
  function chain() {
    const a = add(EMPTY_SCENE, 'box', '박스 1', null)
    const b = add(a.state, 'sphere', '구 1', a.id)
    const c = add(b.state, 'cylinder', '원기둥 1', b.id)
    return { scene: c.state, box: a.id, sphere: b.id, cylinder: c.id }
  }

  it('한 줄로 이어진 계층에서는 대부분 옮길 곳이 없다 — 그리고 이유를 말한다', () => {
    // **이것이 조용하면 사용자에게는 고장과 구분되지 않는다.** 네 방향 중 셋이 할 일이
    // 없는 모양이 드물지 않다 — 자식을 하나씩 달아 내려가면 바로 이 모양이 된다
    const { scene, cylinder } = chain()

    for (const direction of ['up', 'down', 'in'] as const) {
      const plan = planKeyboardMove(scene, cylinder, direction)
      expect(plan.ok, direction).toBe(false)
      expect(plan.ok === false && plan.reason.length > 0, direction).toBe(true)
    }
  })

  it('한 단 나오기는 동작한다 — 그리고 되돌려진다', () => {
    const { scene, box, sphere, cylinder } = chain()
    const plan = planKeyboardMove(scene, cylinder, 'out')
    if (!plan.ok) throw new Error(plan.reason)

    const command = reparentNode(scene, cylinder, plan.parentId, plan.index)
    const moved = applyCommand(scene, command)

    expect(moved.nodes[box]?.childIds).toStrictEqual([sphere, cylinder])
    expect(moved.nodes[sphere]?.childIds).toStrictEqual([])
    expect(revertCommand(moved, command)).toStrictEqual(scene)
  })

  it('최상위에서 더 나갈 수 없다', () => {
    const { scene, box } = chain()
    expect(planKeyboardMove(scene, box, 'out').ok).toBe(false)
  })

  it('형제가 있으면 위아래로 옮겨지고 자리가 맞는다', () => {
    const { scene, groupId, box1, box2 } = fixture()

    const down = planKeyboardMove(scene, box1, 'down')
    if (!down.ok) throw new Error(down.reason)
    const moved = applyCommand(scene, reparentNode(scene, box1, down.parentId, down.index))
    expect(moved.nodes[groupId]?.childIds).toStrictEqual([box2, box1])

    const up = planKeyboardMove(moved, box1, 'up')
    if (!up.ok) throw new Error(up.reason)
    const back = applyCommand(moved, reparentNode(moved, box1, up.parentId, up.index))
    expect(back.nodes[groupId]?.childIds).toStrictEqual([box1, box2])
  })

  it('안으로 넣기는 바로 위 형제의 마지막 자식이 된다', () => {
    const { scene, groupId, box2, box3 } = fixture()

    // box3 는 루트의 두 번째이고 바로 위 형제는 그룹이다
    const plan = planKeyboardMove(scene, box3, 'in')
    if (!plan.ok) throw new Error(plan.reason)

    const moved = applyCommand(scene, reparentNode(scene, box3, plan.parentId, plan.index))
    expect(moved.nodes[groupId]?.childIds.at(-1)).toBe(box3)
    expect(moved.nodes[groupId]?.childIds).toContain(box2)
    expect(moved.rootIds).toStrictEqual([groupId])
  })

  it('방향키 이름이 방향으로 이어져 있다', () => {
    // 이름이 어긋나면 단축키가 조용히 다른 일을 한다
    expect(DIRECTION_BY_KEY['ArrowUp']).toBe('up')
    expect(DIRECTION_BY_KEY['ArrowDown']).toBe('down')
    expect(DIRECTION_BY_KEY['ArrowLeft']).toBe('out')
    expect(DIRECTION_BY_KEY['ArrowRight']).toBe('in')
    expect(DIRECTION_BY_KEY['Enter']).toBeUndefined()
  })
})

describe('추가 (A-11)', () => {
  it('이름이 겹치지 않는다', () => {
    const first = buildAddCommand(EMPTY_SCENE, 'box', null)
    const scene = applyCommand(EMPTY_SCENE, first)
    const second = buildAddCommand(scene, 'box', null)

    expect(first.payload.node.name).toBe('박스 1')
    expect(second.payload.node.name).toBe('박스 2')
  })

  it('지웠다 다시 추가해도 이름이 겹치지 않는다', () => {
    // 노드 수로 번호를 매기면 여기서 `박스 2` 가 두 번 나온다
    let scene = applyCommand(EMPTY_SCENE, buildAddCommand(EMPTY_SCENE, 'box', null))
    const second = buildAddCommand(scene, 'box', null)
    scene = applyCommand(scene, second)

    const firstId = Object.values(scene.nodes).find((node) => node.name === '박스 1')?.id
    if (!firstId) throw new Error('첫 박스를 찾지 못했습니다')

    scene = applyCommand(scene, removeNode(scene, firstId))
    expect(nextNodeName(scene, 'box')).toBe('박스 1')
    expect(nextNodeName(scene, 'sphere')).toBe('구 1')
  })

  it('선택한 노드 밑에 들어간다', () => {
    const { scene, groupId } = fixture()
    const command = buildAddCommand(scene, 'sphere', groupId)
    const next = applyCommand(scene, command)

    expect(next.nodes[groupId]?.childIds).toHaveLength(3)
    expect(next.nodes[command.payload.node.id]?.parentId).toBe(groupId)
  })
})

describe('아웃라이너 조작은 전부 되돌려진다', () => {
  it('이름 변경·삭제·계층 이동을 섞은 뒤 전부 되돌리면 처음으로 돌아온다', () => {
    // **앞 커맨드의 결과 위에서 다음 커맨드를 만든다.** 전부 같은 base 씬에서 만들면
    // 순서를 바꿔도 결과가 같은 집합이 되어 순서 의존 버그를 원리적으로 잡지 못한다
    const { scene: base, groupId, box1, box3 } = fixture()

    const commands: Command[] = []
    let scene = base

    const rename = renameNode(scene, box1, '이름 바꾼 박스')
    commands.push(rename)
    scene = applyCommand(scene, rename)

    const intoGroup = resolveDrop(scene, box3, { kind: 'onNode', nodeId: groupId })
    if (!intoGroup) throw new Error('그룹 안으로 옮기지 못했습니다')
    const move = reparentNode(scene, box3, intoGroup.parentId, intoGroup.index)
    commands.push(move)
    scene = applyCommand(scene, move)

    const added = buildAddCommand(scene, 'box', groupId)
    commands.push(added)
    scene = applyCommand(scene, added)

    const outward = resolveDrop(scene, box1, { kind: 'gap', parentId: null, index: 0 })
    if (!outward) throw new Error('바깥으로 꺼내지 못했습니다')
    const pullOut = reparentNode(scene, box1, outward.parentId, outward.index)
    commands.push(pullOut)
    scene = applyCommand(scene, pullOut)

    const remove = removeNode(scene, groupId)
    commands.push(remove)
    scene = applyCommand(scene, remove)

    // 실제로 무언가 달라졌는지부터 확인한다 — 안 그러면 아래 왕복이 항상 통과한다
    expect(scene).not.toStrictEqual(base)
    expect(scene.rootIds).toStrictEqual([box1])

    for (const command of [...commands].reverse()) {
      scene = revertCommand(scene, command)
    }

    expect(scene).toStrictEqual(base)
  })

  it('JSON 을 건너간 커맨드로 되돌려도 결과가 같다', () => {
    // 아웃라이너가 만드는 커맨드도 조수(F-3)·협업(K-4)이 쓰는 것과 같은 객체여야 한다
    const { scene: base, groupId, box3 } = fixture()

    const placement = resolveDrop(base, box3, { kind: 'onNode', nodeId: groupId })
    if (!placement) throw new Error('자리를 얻지 못했습니다')

    const command = reparentNode(base, box3, placement.parentId, placement.index)
    const roundTripped = parseCommand(serializeCommand(command))

    expect(roundTripped).toStrictEqual(command)
    expect(revertCommand(applyCommand(base, roundTripped), roundTripped)).toStrictEqual(base)
  })
})

/**
 * 접힘은 씬 데이터가 아니라 화면 상태이지만, **그것을 푸는 책임은 커맨드가 지나가는 자리에
 * 있다**(`store.ts` 의 `revealed`). 노드를 씬에 놓는 경로가 아웃라이너 밖에도 있기 때문이다 —
 * 지금은 Alt+방향키이고 앞으로 기즈모와 조수(F-3) · 협업 수신(K-4)이 더해진다.
 *
 * 여기서 검사하지 않으면 새 경로가 접힘을 빠뜨렸을 때 아무 데도 걸리지 않는다. 그리고 그
 * 증상은 오류가 아니라 **아무 일도 일어나지 않은 것처럼 보이는 화면**이라 3차에서도 지나가기
 * 쉽다 — 커맨드는 성공했고 토스트도 떴기 때문이다.
 */
describe('접힘 — 커맨드가 건드린 노드는 화면에 보인다', () => {
  function storeWith(scene: SceneState, collapsedIds: NodeId[]) {
    useEditorStore.setState({
      scene,
      history: EMPTY_HISTORY,
      selectedIds: [],
      collapsedIds: new Set(collapsedIds),
    })
    return useEditorStore.getState()
  }

  const collapsedNow = () => useEditorStore.getState().collapsedIds

  it('접힌 그룹 안에 추가하면 그 그룹이 펼쳐진다', () => {
    const { scene, groupId } = fixture()
    const store = storeWith(scene, [groupId])

    expect(store.execute(buildAddCommand(scene, 'box', groupId)).ok).toBe(true)
    expect(collapsedNow().has(groupId)).toBe(false)
  })

  it('접힌 그룹 안으로 드롭해도 펼쳐진다', () => {
    const { scene, groupId, box3 } = fixture()
    const store = storeWith(scene, [groupId])

    const placement = resolveDrop(scene, box3, { kind: 'onNode', nodeId: groupId })
    if (!placement) throw new Error('자리를 얻지 못했습니다')

    expect(store.execute(reparentNode(scene, box3, placement.parentId, placement.index)).ok).toBe(
      true,
    )
    expect(collapsedNow().has(groupId)).toBe(false)
  })

  it('Alt+방향키로 접힌 형제 안에 넣어도 펼쳐진다', () => {
    // 이 경로가 아웃라이너 컴포넌트 밖에 있다 — 접힘이 컴포넌트 상태였을 때 닿지 못하던 곳이다
    const { scene, groupId, box3 } = fixture()
    const store = storeWith(scene, [groupId])

    const plan = planKeyboardMove(scene, box3, 'in')
    if (!plan.ok) throw new Error(plan.reason)

    expect(store.execute(reparentNode(scene, box3, plan.parentId, plan.index)).ok).toBe(true)
    expect(collapsedNow().has(groupId)).toBe(false)
  })

  it('여러 단으로 접혀 있으면 조상을 전부 펼친다', () => {
    // 한 단만 펼치면 노드는 여전히 보이지 않는다
    const outer = add(EMPTY_SCENE, 'group', '바깥 그룹', null)
    const inner = add(outer.state, 'group', '안쪽 그룹', outer.id)
    const store = storeWith(inner.state, [outer.id, inner.id])

    expect(store.execute(buildAddCommand(inner.state, 'box', inner.id)).ok).toBe(true)
    expect(collapsedNow().has(outer.id)).toBe(false)
    expect(collapsedNow().has(inner.id)).toBe(false)
  })

  it('되돌리기로 되살아난 노드도 보인다', () => {
    const { scene, groupId, box1 } = fixture()
    const store = storeWith(scene, [])

    expect(store.execute(removeNode(scene, box1)).ok).toBe(true)
    useEditorStore.setState({ collapsedIds: new Set([groupId]) })

    expect(useEditorStore.getState().undo().ok).toBe(true)
    expect(useEditorStore.getState().scene.nodes[box1]).toBeDefined()
    expect(collapsedNow().has(groupId)).toBe(false)
  })

  it('건드리지 않은 접힘은 그대로 두고, 바뀐 것이 없으면 같은 Set 을 돌려준다', () => {
    // 매번 새 Set 을 만들면 커맨드 하나마다 아웃라이너 전체가 다시 그려진다
    const { scene, groupId, box3 } = fixture()
    const store = storeWith(scene, [groupId])
    const before = collapsedNow()

    expect(store.execute(renameNode(scene, box3, '다른 이름')).ok).toBe(true)
    expect(collapsedNow().has(groupId)).toBe(true)
    expect(collapsedNow()).toBe(before)
  })
})

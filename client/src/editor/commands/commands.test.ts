import { describe, expect, it } from 'vitest'
import * as make from './factories'
import {
  applyCommand,
  EMPTY_HISTORY,
  pushCommand,
  redo,
  revertCommand,
  targetNodeId,
  undo,
} from './history'
import { COMMAND_TYPES } from './registry'
import { CommandParseError, parseCommand, serializeCommand, validateCommand } from './serialize'
import { COMMAND_VERSION, type Command, type CommandType } from './types'
import { useEditorStore } from '../scene/store'
import { EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneState } from '../scene/types'

/**
 * 이 파일이 1단계의 핵심 산출물이다.
 *
 * 커맨드는 undo(A-5) · 조수(F-3) · 협업 전파(K-4) 세 곳이 함께 쓰므로, **JSON 으로 오간 뒤에도
 * 같은 결과를 내야 한다**는 성질이 나중에 붙는 기능이 아니라 지금의 완료 조건이다.
 */

/** 부모-자식 두 단계와 형제가 있는 씬. 계층을 건드리는 커맨드를 제대로 태우려면 필요하다. */
function buildScene() {
  let scene: SceneState = EMPTY_SCENE

  const group = make.createNode('group', '그룹')
  scene = applyCommand(scene, make.addNode(scene, group))

  const box = make.createNode('box', '박스')
  scene = applyCommand(scene, make.addNode(scene, box, group.id))

  const sphere = make.createNode('sphere', '구')
  scene = applyCommand(scene, make.addNode(scene, sphere, group.id))

  const loose = make.createNode('cylinder', '원기둥')
  scene = applyCommand(scene, make.addNode(scene, loose))

  return { scene, ids: { group: group.id, box: box.id, sphere: sphere.id, loose: loose.id } }
}

type SceneIds = ReturnType<typeof buildScene>['ids']

/**
 * 커맨드 타입마다 하나씩. 새 타입을 추가하면 여기가 비어 테스트가 실패한다.
 *
 * 노드 id 가 생성 시점의 무작위 값이므로 **커맨드는 반드시 대상 씬에서 만들어야 한다.**
 * 다른 씬에서 만든 커맨드는 없는 id 를 가리킨다.
 */
function sampleCommands(scene: SceneState, ids: SceneIds): Record<CommandType, Command> {
  return {
    addNode: make.addNode(scene, make.createNode('box', '새 박스'), ids.group),
    removeNode: make.removeNode(scene, ids.group),
    setTransform: make.setTransform(scene, ids.box, {
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [2, 2, 2],
    }),
    setMaterial: make.setMaterial(scene, ids.box, {
      color: '#ff0000',
      roughness: 0.1,
      metalness: 0.9,
    }),
    renameNode: make.renameNode(scene, ids.box, '바뀐 이름'),
    reparentNode: make.reparentNode(scene, ids.box, null, 0),
  }
}

describe('커맨드 JSON 왕복', () => {
  it('모든 커맨드 타입에 표본이 있다', () => {
    const { scene, ids } = buildScene()
    expect(Object.keys(sampleCommands(scene, ids)).sort()).toEqual([...COMMAND_TYPES].sort())
  })

  /**
   * **`toStrictEqual` 이어야 한다.** `toEqual` 은 "키가 없는 것"과 "키의 값이 `undefined` 인
   * 것"을 같다고 본다. `JSON.stringify` 는 정확히 그 둘을 뭉개는 변환이므로, 왕복에서
   * 필드가 사라져도 `toEqual` 로는 통과한다 — 완료 판정으로 세운 단언이 판정하려던 바로
   * 그 손실을 못 보게 된다.
   */
  it.each(COMMAND_TYPES)('%s — 왕복 후 적용 결과가 같다', (type) => {
    const { scene, ids } = buildScene()
    const command = sampleCommands(scene, ids)[type]

    const direct = applyCommand(scene, command)
    const roundTripped = applyCommand(scene, parseCommand(serializeCommand(command)))

    expect(roundTripped).toStrictEqual(direct)
  })

  it.each(COMMAND_TYPES)('%s — 왕복 후 되돌리기 결과도 같다', (type) => {
    const { scene, ids } = buildScene()
    const command = sampleCommands(scene, ids)[type]
    const applied = applyCommand(scene, command)

    const direct = revertCommand(applied, command)
    const roundTripped = revertCommand(applied, parseCommand(serializeCommand(command)))

    expect(roundTripped).toStrictEqual(direct)
  })

  it.each(COMMAND_TYPES)('%s — 커맨드 자체가 왕복에서 모양까지 보존된다', (type) => {
    const { scene, ids } = buildScene()
    const command = sampleCommands(scene, ids)[type]

    expect(parseCommand(serializeCommand(command))).toStrictEqual(command)
  })

  /**
   * 위의 `toStrictEqual` 단언이 실제로 무는 지점. 머티리얼이 없는 종류에 `material: undefined`
   * 를 두면 `JSON.stringify` 가 키를 지워 왕복 전후의 모양이 갈라진다. **키를 아예 두지 않는
   * 것이 그 비대칭을 없애는 유일한 방법이다** — 값이 아니라 키의 유무가 문제이기 때문이다.
   */
  it('머티리얼이 없는 종류에는 키 자체가 없다', () => {
    const group = make.createNode('group', '그룹')
    const light = make.createNode('pointLight', '조명')
    const box = make.createNode('box', '박스')

    expect(Object.hasOwn(group, 'material')).toBe(false)
    expect(Object.hasOwn(light, 'material')).toBe(false)
    expect(Object.hasOwn(box, 'material')).toBe(true)

    expect(JSON.parse(JSON.stringify(group))).toStrictEqual(group)
  })

  it('알 수 없는 타입을 거부한다', () => {
    expect(() => parseCommand('{"type":"dropDatabase","payload":{}}')).toThrow(CommandParseError)
  })

  it('payload 가 없으면 거부한다', () => {
    expect(() => parseCommand('{"type":"renameNode"}')).toThrow(CommandParseError)
  })

  it('JSON 이 깨져 있으면 거부한다', () => {
    expect(() => parseCommand('{ 아님')).toThrow(CommandParseError)
  })
})

/**
 * 여기가 조수(F-3)와 협업 수신(K-4)이 들어오는 문이다. 타입 이름만 맞으면 통과시키던 때에는
 * 잘못된 payload 가 커맨드 계층을 지나 `attachNode` 안에서 `TypeError` 로 터지거나, 더 나쁘게는
 * 터지지 않고 노드의 필드를 `undefined` 로 덮었다.
 */
describe('밖에서 들어온 payload 검증', () => {
  /** 검사 순서상 version 이 맨 앞이다. 버전을 빼먹으면 모양 검사에 닿지도 못하고 거절된다 */
  const at = (type: string, payload: unknown) => ({ version: COMMAND_VERSION, type, payload })

  const plainNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'x',
    name: 'x',
    kind: 'box',
    transform: IDENTITY_TRANSFORM,
    parentId: null,
    childIds: [],
    ...overrides,
  })

  const rejected: Record<string, unknown> = {
    'addNode — payload 가 비어 있다': at('addNode', {}),
    'renameNode — payload 가 배열이다': at('renameNode', []),
    'renameNode — to 가 없다': at('renameNode', { nodeId: 'a', from: 'x' }),

    'addNode — node 에 childIds 가 없다': at('addNode', {
      node: { id: 'x', name: 'x', kind: 'box', transform: IDENTITY_TRANSFORM, parentId: null },
      parentId: null,
      index: 0,
    }),
    'addNode — kind 를 모른다': at('addNode', {
      node: plainNode({ kind: 'blackHole' }),
      parentId: null,
      index: 0,
    }),
    // 붙는 데는 성공하고 그 노드를 되돌리는 순간 터진다 — 그 뒤로 되돌리기가 영영 막힌다
    'addNode — 씬에 없는 자식을 데리고 온다': at('addNode', {
      node: plainNode({ childIds: ['유령'] }),
      parentId: null,
      index: 0,
    }),

    'setTransform — to 의 position 이 길이 2 다': at('setTransform', {
      nodeId: 'a',
      from: IDENTITY_TRANSFORM,
      to: { position: [0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }),
    'setTransform — to 가 통째로 없다': at('setTransform', {
      nodeId: 'a',
      from: IDENTITY_TRANSFORM,
    }),
    'setMaterial — roughness 가 문자열이다': at('setMaterial', {
      nodeId: 'a',
      from: { color: '#fff', roughness: 0.5, metalness: 0 },
      to: { color: '#fff', roughness: '높음', metalness: 0 },
    }),

    'removeNode — removed 에 rootNodeId 가 없다': at('removeNode', {
      removed: [plainNode({ id: 'other' })],
      rootNodeId: 'missing',
      parentId: null,
      index: 0,
    }),
    // 되살리기가 이 목록만 보고 계층을 세우므로, 닫히지 않으면 복원된 씬에 유령 참조가 남는다
    'removeNode — 목록 밖의 자식을 가리킨다': at('removeNode', {
      removed: [plainNode({ id: 'root', childIds: ['목록에-없음'] })],
      rootNodeId: 'root',
      parentId: null,
      index: 0,
    }),
    'removeNode — 목록 밖의 부모를 가리킨다': at('removeNode', {
      removed: [plainNode({ id: 'root' }), plainNode({ id: 'child', parentId: '남' })],
      rootNodeId: 'root',
      parentId: null,
      index: 0,
    }),
    'removeNode — 같은 id 가 두 번 있다': at('removeNode', {
      removed: [plainNode({ id: 'root' }), plainNode({ id: 'root' })],
      rootNodeId: 'root',
      parentId: null,
      index: 0,
    }),

    'reparentNode — to.index 가 음수다': at('reparentNode', {
      nodeId: 'a',
      from: { parentId: null, index: 0 },
      to: { parentId: null, index: -1 },
    }),

    '버전이 없다': { type: 'renameNode', payload: { nodeId: 'a', from: 'A', to: 'B' } },
    '버전이 다르다': {
      version: COMMAND_VERSION + 1,
      type: 'renameNode',
      payload: { nodeId: 'a', from: 'A', to: 'B' },
    },
  }

  it.each(Object.keys(rejected))('%s → 거절한다', (label) => {
    expect(() => validateCommand(rejected[label])).toThrow(CommandParseError)
  })

  /**
   * 위의 거절 표본들이 **모양 때문에 거절된 것이 맞는지** 확인한다. 버전 검사가 맨 앞에 있어서,
   * 표본에 버전을 빼먹으면 전부 "판이 다릅니다"로 거절되고 모양 검사는 한 줄도 안 돈다 —
   * 테스트는 초록색인데 검사하려던 것은 하나도 검사하지 않는 상태가 된다.
   */
  it('모양 표본은 버전 때문에 거절된 것이 아니다', () => {
    for (const [label, sample] of Object.entries(rejected)) {
      if (label.startsWith('버전')) continue

      let message = ''
      try {
        validateCommand(sample)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }

      expect(message, label).not.toBe('')
      expect(message, label).not.toContain('판이 다릅니다')
    }
  })

  it('팩토리가 만든 커맨드는 전부 통과한다', () => {
    const { scene, ids } = buildScene()
    const commands = sampleCommands(scene, ids)

    for (const type of COMMAND_TYPES) {
      expect(() => validateCommand(JSON.parse(serializeCommand(commands[type])))).not.toThrow()
    }
  })
})

/**
 * 모양 검증을 통과한 커맨드가 씬과 만났을 때. 여기서 막지 못하면 **화면에는 아무 이상이
 * 없는 채로 씬이 망가지고**, 몇 조작 뒤의 되돌리기에서야 터진다.
 */
describe('모양은 맞지만 씬과 어긋나는 커맨드', () => {
  /**
   * `state.nodes` 는 평범한 객체라 `nodes['constructor']` 가 `Object` 생성자를 돌려준다.
   * 함수는 truthy 라 "있는 노드"로 통과하고, 그것을 스프레드하면 `id` 가 없는 껍데기가 나와
   * `nodes['undefined']` 자리에 유령 노드가 들어앉는다.
   */
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    "'%s' 를 씬에 있는 노드로 착각하지 않는다",
    (protoKey) => {
      const { scene } = buildScene()
      const command: Command = {
        version: COMMAND_VERSION,
        type: 'renameNode',
        payload: { nodeId: protoKey, from: 'A', to: 'B' },
      }

      // 모양은 흠잡을 데가 없다 — 문지기는 통과시킨다
      expect(() => validateCommand(command)).not.toThrow()
      // 막는 것은 씬을 아는 쪽이다
      expect(() => applyCommand(scene, command)).toThrow(/씬에 없는 노드/)
      expect(Object.keys(scene.nodes)).toHaveLength(4)
    },
  )

  /**
   * 적용은 살아 있는 씬의 서브트리를 지우고 되돌리기는 payload 의 목록만 되살린다. 둘이
   * 어긋나면 지운 것 중 일부가 영영 돌아오지 않는다 — 협업에서 상대가 커맨드를 만든 뒤 내
   * 쪽에서 그 아래에 자식이 생겼을 때가 그 상태다.
   */
  it('삭제할 서브트리가 기록과 다르면 지우지 않고 거절한다', () => {
    const { scene, ids } = buildScene()
    const command = make.removeNode(scene, ids.group)

    // 커맨드를 만든 뒤 그룹 밑에 자식이 하나 더 생겼다
    const latecomer = make.createNode('box', '늦게 온 박스')
    const drifted = applyCommand(scene, make.addNode(scene, latecomer, ids.group))

    expect(() => applyCommand(drifted, command)).toThrow(/서브트리가 커맨드에 기록된 것과 다릅니다/)
    expect(drifted.nodes[latecomer.id]).toBeDefined()
    expect(drifted.nodes[ids.group]).toBeDefined()
  })

  it('원래 씬에서는 그대로 지워진다', () => {
    const { scene, ids } = buildScene()
    const command = make.removeNode(scene, ids.group)

    expect(() => applyCommand(scene, command)).not.toThrow()
  })
})

/**
 * 커맨드가 건드리는 노드를 타입별 분기 없이 꺼낼 수 있어야 한다. 협업 lock 검사(K-3)와
 * 전파 봉투(`docs/ARCHITECTURE.md` 6절)가 그것을 쓰는데, 커맨드 밖에서 `switch` 로 짜면
 * 타입을 더할 때 고치는 것을 잊어도 컴파일이 통과한다.
 */
describe('대상 노드 접근자', () => {
  it.each(COMMAND_TYPES)('%s — 대상 노드를 꺼낼 수 있다', (type) => {
    const { scene, ids } = buildScene()
    const target = targetNodeId(sampleCommands(scene, ids)[type])

    expect(typeof target).toBe('string')
    expect(target.length).toBeGreaterThan(0)
  })

  it('타입마다 payload 안의 자리가 다른데도 같은 답을 준다', () => {
    const { scene, ids } = buildScene()
    const added = make.createNode('box', '새 박스')

    expect(targetNodeId(make.addNode(scene, added))).toBe(added.id)
    expect(targetNodeId(make.removeNode(scene, ids.group))).toBe(ids.group)
    expect(targetNodeId(make.renameNode(scene, ids.box, 'x'))).toBe(ids.box)
  })
})

/**
 * 모양이 맞아도 적용에 실패할 수 있다 — 가리키는 노드가 씬에 없는 경우다. 검증은 씬을 모르므로
 * 그것까지 볼 수 없고, 그래서 스토어가 실패를 값으로 바꿔 받는다. WebSocket 콜백에서 던진
 * 예외는 받을 곳이 없다.
 */
describe('스토어의 외부 진입점', () => {
  function freshStore() {
    useEditorStore.setState({ scene: EMPTY_SCENE, history: EMPTY_HISTORY, selectedIds: [] })
    return useEditorStore.getState()
  }

  it('모양이 틀린 커맨드를 던지지 않고 실패로 돌려준다', () => {
    const store = freshStore()
    const result = store.executeSerialized({ type: 'addNode', payload: {} })

    expect(result.ok).toBe(false)
    expect(useEditorStore.getState().scene).toStrictEqual(EMPTY_SCENE)
  })

  it('없는 노드를 가리키는 커맨드도 실패로 돌려준다', () => {
    const store = freshStore()
    const result = store.executeSerialized({
      type: 'renameNode',
      payload: { nodeId: '없는-노드', from: 'A', to: 'B' },
    })

    expect(result.ok).toBe(false)
    expect(useEditorStore.getState().history.past).toHaveLength(0)
  })

  it('성공하면 히스토리에 쌓인다', () => {
    const store = freshStore()
    const node = make.createNode('box', '박스')
    const result = store.executeSerialized(
      JSON.parse(serializeCommand(make.addNode(EMPTY_SCENE, node))),
    )

    expect(result.ok).toBe(true)
    expect(useEditorStore.getState().scene.rootIds).toStrictEqual([node.id])
    expect(useEditorStore.getState().history.past).toHaveLength(1)
  })
})

describe('적용과 되돌리기', () => {
  it.each(COMMAND_TYPES)('%s — 적용 후 되돌리면 원래 상태로 돌아온다', (type) => {
    const { scene, ids } = buildScene()
    const command = sampleCommands(scene, ids)[type]

    expect(revertCommand(applyCommand(scene, command), command)).toStrictEqual(scene)
  })

  it.each(COMMAND_TYPES)('%s — 입력 상태를 바꾸지 않는다', (type) => {
    const { scene, ids } = buildScene()
    const snapshot = structuredClone(scene)

    applyCommand(scene, sampleCommands(scene, ids)[type])

    expect(scene).toStrictEqual(snapshot)
  })

  it('삭제는 자손까지 지우고 되돌리면 계층이 그대로 살아난다', () => {
    const { scene, ids } = buildScene()
    const command = make.removeNode(scene, ids.group)

    const removed = applyCommand(scene, command)
    expect(removed.nodes[ids.group]).toBeUndefined()
    expect(removed.nodes[ids.box]).toBeUndefined()
    expect(removed.nodes[ids.loose]).toBeDefined()

    expect(revertCommand(removed, command)).toStrictEqual(scene)
  })

  it('자기 자손 아래로는 옮길 수 없다', () => {
    const { scene, ids } = buildScene()
    const command = make.reparentNode(scene, ids.group, ids.box, 0)

    expect(() => applyCommand(scene, command)).toThrow()
  })

  it('계층을 옮겨도 자손이 따라온다', () => {
    const { scene, ids } = buildScene()
    const moved = applyCommand(scene, make.reparentNode(scene, ids.group, ids.loose, 0))

    expect(moved.nodes[ids.group]?.parentId).toBe(ids.loose)
    expect(moved.nodes[ids.group]?.childIds).toStrictEqual([ids.box, ids.sphere])
    expect(moved.nodes[ids.box]).toBeDefined()
    expect(moved.rootIds).toStrictEqual([ids.loose])
  })

  /**
   * UI 는 `crypto.randomUUID()` 로 id 를 만들지만 조수와 협업 상대는 id 를 직접 실어 보낸다.
   * 덮어쓰기를 허용하면 형제 목록에만 같은 id 가 둘 남아, 그 뒤의 삭제가 둘을 함께 지우면서
   * 되돌리기가 원래 목록을 복원하지 못한다.
   */
  it('이미 있는 id 로는 노드를 더할 수 없다', () => {
    const { scene, ids } = buildScene()
    const duplicate = { ...make.createNode('box', '사칭'), id: ids.box }

    expect(() => applyCommand(scene, make.addNode(scene, duplicate))).toThrow()
    expect(scene.rootIds).toStrictEqual([ids.group, ids.loose])
  })
})

describe('히스토리', () => {
  /**
   * **커맨드를 앞 커맨드의 결과 위에서 만든다.** 서로 다른 노드를 건드리는 커맨드를 같은 base
   * 씬에서 만들어 늘어놓으면 순서를 바꿔도 결과가 같은 집합이 되고, 그러면 순서에 의존하는
   * 버그를 원리적으로 잡을 수 없다 — 통과해도 아무것도 보증하지 않는 단언이 된다.
   *
   * 그래서 `addNode` 와 `reparentNode` 를 반드시 넣는다. **apply/revert 가 필드 교환이 아닌
   * 커맨드가 이 둘뿐**이고, 계층이 실제로 접혔다 펴지는 것도 이 둘에서만 일어난다.
   */
  it('undo 와 redo 를 반복해도 상태가 어긋나지 않는다', () => {
    const { scene, ids } = buildScene()

    const commands: Command[] = []
    const checkpoints = [scene]
    let current = { scene, history: EMPTY_HISTORY }

    /** 직전 결과 위에서 커맨드를 만들어 밀어 넣는다 */
    function step(make: (state: SceneState) => Command) {
      const command = make(current.scene)
      commands.push(command)
      current = pushCommand(current.scene, current.history, command)
      checkpoints.push(current.scene)
    }

    const added = make.createNode('box', '나중에 넣은 박스')

    step((s) => make.renameNode(s, ids.box, '1차'))
    step((s) => make.addNode(s, added, ids.group, 0)) // 그룹 맨 앞에 끼워 넣는다
    step((s) => make.reparentNode(s, ids.sphere, ids.loose, 0)) // 다른 부모로
    step((s) =>
      make.setTransform(s, added.id, {
        position: [5, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 2, 2],
      }),
    )
    step((s) => make.reparentNode(s, ids.group, null, 0)) // 자손을 데리고 뿌리 맨 앞으로
    step((s) => make.removeNode(s, ids.loose)) // 아까 옮겨온 구까지 함께 지운다

    // 중간에 실제로 계층이 바뀌었는지 확인한다. 안 바뀌었으면 위 시퀀스가 헛돈 것이다
    expect(checkpoints[3]?.nodes[ids.sphere]?.parentId).toBe(ids.loose)
    expect(checkpoints[6]?.nodes[ids.sphere]).toBeUndefined()

    // 전부 되돌리기
    for (let i = commands.length - 1; i >= 0; i -= 1) {
      current = undo(current.scene, current.history)
      expect(current.scene).toStrictEqual(checkpoints[i])
    }

    // 전부 다시 실행
    for (let i = 0; i < commands.length; i += 1) {
      current = redo(current.scene, current.history)
      expect(current.scene).toStrictEqual(checkpoints[i + 1])
    }

    // 세 번째 왕복까지 — `revert∘apply = id` 만으로는 `apply∘revert∘apply = apply` 가 안 나온다
    for (let round = 0; round < 2; round += 1) {
      for (let i = commands.length - 1; i >= 0; i -= 1) {
        current = undo(current.scene, current.history)
        expect(current.scene).toStrictEqual(checkpoints[i])
      }
      for (let i = 0; i < commands.length; i += 1) {
        current = redo(current.scene, current.history)
        expect(current.scene).toStrictEqual(checkpoints[i + 1])
      }
    }
  })

  it('새 커맨드를 실행하면 redo 스택을 버린다', () => {
    const { scene, ids } = buildScene()

    let current = pushCommand(scene, EMPTY_HISTORY, make.renameNode(scene, ids.box, 'A'))
    current = undo(current.scene, current.history)
    expect(current.history.future).toHaveLength(1)

    current = pushCommand(
      current.scene,
      current.history,
      make.renameNode(current.scene, ids.box, 'B'),
    )
    expect(current.history.future).toHaveLength(0)
  })

  it('빈 히스토리에서 undo·redo 해도 아무 일도 없다', () => {
    const { scene } = buildScene()

    expect(undo(scene, EMPTY_HISTORY).scene).toStrictEqual(scene)
    expect(redo(scene, EMPTY_HISTORY).scene).toStrictEqual(scene)
  })
})

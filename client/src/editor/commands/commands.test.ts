import { describe, expect, it } from 'vitest'
import * as make from './factories'
import { applyCommand, EMPTY_HISTORY, pushCommand, redo, revertCommand, undo } from './history'
import { COMMAND_TYPES } from './registry'
import { CommandParseError, parseCommand, serializeCommand } from './serialize'
import type { Command, CommandType } from './types'
import { EMPTY_SCENE, type SceneState } from '../scene/types'

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

  it.each(COMMAND_TYPES)('%s — 왕복 후 적용 결과가 같다', (type) => {
    const { scene, ids } = buildScene()
    const command = sampleCommands(scene, ids)[type]

    const direct = applyCommand(scene, command)
    const roundTripped = applyCommand(scene, parseCommand(serializeCommand(command)))

    expect(roundTripped).toEqual(direct)
  })

  it.each(COMMAND_TYPES)('%s — 왕복 후 되돌리기 결과도 같다', (type) => {
    const { scene, ids } = buildScene()
    const command = sampleCommands(scene, ids)[type]
    const applied = applyCommand(scene, command)

    const direct = revertCommand(applied, command)
    const roundTripped = revertCommand(applied, parseCommand(serializeCommand(command)))

    expect(roundTripped).toEqual(direct)
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

describe('적용과 되돌리기', () => {
  it.each(COMMAND_TYPES)('%s — 적용 후 되돌리면 원래 상태로 돌아온다', (type) => {
    const { scene, ids } = buildScene()
    const command = sampleCommands(scene, ids)[type]

    expect(revertCommand(applyCommand(scene, command), command)).toEqual(scene)
  })

  it.each(COMMAND_TYPES)('%s — 입력 상태를 바꾸지 않는다', (type) => {
    const { scene, ids } = buildScene()
    const snapshot = structuredClone(scene)

    applyCommand(scene, sampleCommands(scene, ids)[type])

    expect(scene).toEqual(snapshot)
  })

  it('삭제는 자손까지 지우고 되돌리면 계층이 그대로 살아난다', () => {
    const { scene, ids } = buildScene()
    const command = make.removeNode(scene, ids.group)

    const removed = applyCommand(scene, command)
    expect(removed.nodes[ids.group]).toBeUndefined()
    expect(removed.nodes[ids.box]).toBeUndefined()
    expect(removed.nodes[ids.loose]).toBeDefined()

    expect(revertCommand(removed, command)).toEqual(scene)
  })

  it('자기 자손 아래로는 옮길 수 없다', () => {
    const { scene, ids } = buildScene()
    const command = make.reparentNode(scene, ids.group, ids.box, 0)

    expect(() => applyCommand(scene, command)).toThrow()
  })
})

describe('히스토리', () => {
  it('undo 와 redo 를 반복해도 상태가 어긋나지 않는다', () => {
    const { scene, ids } = buildScene()

    const commands = [
      make.renameNode(scene, ids.box, '1차'),
      make.setTransform(scene, ids.sphere, {
        position: [5, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }),
      make.removeNode(scene, ids.loose),
    ]

    let current = { scene, history: EMPTY_HISTORY }
    const checkpoints = [current.scene]

    for (const command of commands) {
      current = pushCommand(current.scene, current.history, command)
      checkpoints.push(current.scene)
    }

    // 전부 되돌리기
    for (let i = commands.length - 1; i >= 0; i -= 1) {
      current = undo(current.scene, current.history)
      expect(current.scene).toEqual(checkpoints[i])
    }

    // 전부 다시 실행
    for (let i = 0; i < commands.length; i += 1) {
      current = redo(current.scene, current.history)
      expect(current.scene).toEqual(checkpoints[i + 1])
    }

    // 한 번 더 왕복해도 같은 자리
    for (let i = commands.length - 1; i >= 0; i -= 1) {
      current = undo(current.scene, current.history)
    }
    expect(current.scene).toEqual(checkpoints[0])
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

    expect(undo(scene, EMPTY_HISTORY).scene).toEqual(scene)
    expect(redo(scene, EMPTY_HISTORY).scene).toEqual(scene)
  })
})

import { NODE_KINDS, type NodeKind } from '../scene/types'
import { COMMANDS } from './registry'
import type { Command, CommandType } from './types'

/**
 * 커맨드는 이미 순수 데이터라 직렬화에 변환이 필요 없다. **필요한 것은 반대 방향의 검증이다** —
 * 협업 상대(K-4)나 조수(F-3)가 보낸 것을 그대로 믿고 적용하면 모르는 타입에서 조용히 어긋난다.
 *
 * 그래서 **우리가 밖에서 받아들이는 것의 전부를 이 파일 하나에 적는다.** 타입 이름만 보고
 * `payload` 를 통과시키면 검문소가 문패만 확인하는 셈이 된다 — `{type:'addNode', payload:{}}`
 * 는 이름이 맞으므로 통과하고, 그다음 `attachNode` 안에서 `TypeError` 로 터진다. 터지는 자리와
 * 원인이 멀어지는 것이 문제이고, 더 나쁜 경우에는 터지지도 않고 노드의 트랜스폼이 `undefined`
 * 로 덮인다.
 *
 * **검사하는 것은 모양뿐이다.** `nodeId` 가 가리키는 노드가 실제로 씬에 있는지는 여기서 알 수
 * 없다 — 씬을 모르기 때문이다. 그쪽은 적용 시점에 `getNode` 가 던지며, 그 예외를
 * `useEditorStore.executeSerialized` 가 받아 결과값으로 바꾼다.
 */

export class CommandParseError extends Error {}

function fail(message: string): never {
  throw new CommandParseError(message)
}

type Fields = Record<string, unknown>

/** 배열도 `typeof` 로는 `'object'` 다. 배열을 payload 로 넘기면 모든 필드가 `undefined` 가 된다 */
function object(value: unknown, path: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} 은(는) 객체여야 합니다`)
  }
  return value as Fields
}

function str(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(`${path} 은(는) 문자열이어야 합니다`)
  return value
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path} 은(는) 유한한 수여야 합니다`)
  }
  return value
}

function index(value: unknown, path: string): number {
  const parsed = num(value, path)
  if (!Number.isInteger(parsed) || parsed < 0) fail(`${path} 은(는) 0 이상의 정수여야 합니다`)
  return parsed
}

function nodeId(value: unknown, path: string): void {
  str(value, path)
}

/** 뿌리에 있는 노드의 부모는 `null` 이다 */
function nullableNodeId(value: unknown, path: string): void {
  if (value !== null) str(value, path)
}

function nodeIdList(value: unknown, path: string): void {
  if (!Array.isArray(value)) fail(`${path} 은(는) 배열이어야 합니다`)
  value.forEach((id, i) => str(id, `${path}[${i}]`))
}

function vec3(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== 3)
    fail(`${path} 은(는) 길이 3 의 배열이어야 합니다`)
  value.forEach((component, i) => num(component, `${path}[${i}]`))
}

function transform(value: unknown, path: string): void {
  const fields = object(value, path)
  vec3(fields.position, `${path}.position`)
  vec3(fields.rotation, `${path}.rotation`)
  vec3(fields.scale, `${path}.scale`)
}

function material(value: unknown, path: string): void {
  const fields = object(value, path)
  str(fields.color, `${path}.color`)
  num(fields.roughness, `${path}.roughness`)
  num(fields.metalness, `${path}.metalness`)
}

function sceneNode(value: unknown, path: string): void {
  const fields = object(value, path)
  nodeId(fields.id, `${path}.id`)
  str(fields.name, `${path}.name`)

  if (!NODE_KINDS.includes(fields.kind as NodeKind)) {
    fail(`${path}.kind 가 알 수 없는 종류입니다: ${String(fields.kind)}`)
  }

  transform(fields.transform, `${path}.transform`)
  // 라이트와 group 에는 머티리얼이 없다. 없는 것과 잘못된 것은 다르다
  if (fields.material !== undefined) material(fields.material, `${path}.material`)
  nullableNodeId(fields.parentId, `${path}.parentId`)
  nodeIdList(fields.childIds, `${path}.childIds`)
}

function placement(value: unknown, path: string): void {
  const fields = object(value, path)
  nullableNodeId(fields.parentId, `${path}.parentId`)
  index(fields.index, `${path}.index`)
}

const PAYLOAD_VALIDATORS: { [T in CommandType]: (payload: Fields) => void } = {
  addNode: (payload) => {
    sceneNode(payload.node, 'node')
    nullableNodeId(payload.parentId, 'parentId')
    index(payload.index, 'index')
  },

  removeNode: (payload) => {
    if (!Array.isArray(payload.removed) || payload.removed.length === 0) {
      fail('removed 는 비어 있지 않은 배열이어야 합니다')
    }
    payload.removed.forEach((node, i) => sceneNode(node, `removed[${i}]`))

    const rootNodeId = str(payload.rootNodeId, 'rootNodeId')
    // 되살리기가 removed 안에서 뿌리를 찾아 원래 자리에 넣는다. 없으면 계층이 어긋난 채 복원된다
    if (!payload.removed.some((node) => (node as Fields).id === rootNodeId)) {
      fail('removed 에 rootNodeId 에 해당하는 노드가 없습니다')
    }

    nullableNodeId(payload.parentId, 'parentId')
    index(payload.index, 'index')
  },

  setTransform: (payload) => {
    nodeId(payload.nodeId, 'nodeId')
    transform(payload.from, 'from')
    transform(payload.to, 'to')
  },

  setMaterial: (payload) => {
    nodeId(payload.nodeId, 'nodeId')
    material(payload.from, 'from')
    material(payload.to, 'to')
  },

  renameNode: (payload) => {
    nodeId(payload.nodeId, 'nodeId')
    str(payload.from, 'from')
    str(payload.to, 'to')
  },

  reparentNode: (payload) => {
    nodeId(payload.nodeId, 'nodeId')
    placement(payload.from, 'from')
    placement(payload.to, 'to')
  },
}

function isCommandType(value: unknown): value is CommandType {
  return typeof value === 'string' && Object.hasOwn(COMMANDS, value)
}

export function serializeCommand(command: Command): string {
  return JSON.stringify(command)
}

export function parseCommand(json: string): Command {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (error) {
    throw new CommandParseError(`커맨드 JSON 을 읽지 못했습니다: ${String(error)}`)
  }

  return validateCommand(raw)
}

export function validateCommand(raw: unknown): Command {
  const candidate = object(raw, '커맨드')

  if (!isCommandType(candidate.type)) {
    throw new CommandParseError(`알 수 없는 커맨드 타입입니다: ${String(candidate.type)}`)
  }

  PAYLOAD_VALIDATORS[candidate.type](object(candidate.payload, `${candidate.type} 의 payload`))

  return candidate as Command
}

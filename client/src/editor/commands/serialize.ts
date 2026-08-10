import { COMMANDS } from './registry'
import type { Command, CommandType } from './types'

/**
 * 커맨드는 이미 순수 데이터라 직렬화에 변환이 필요 없다. **필요한 것은 반대 방향의 검증이다** —
 * 협업 상대나 조수가 보낸 것을 그대로 믿고 적용하면 모르는 타입에서 조용히 어긋난다.
 */

export class CommandParseError extends Error {}

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
  if (typeof raw !== 'object' || raw === null) {
    throw new CommandParseError('커맨드는 객체여야 합니다')
  }

  const candidate = raw as { type?: unknown; payload?: unknown }

  if (!isCommandType(candidate.type)) {
    throw new CommandParseError(`알 수 없는 커맨드 타입입니다: ${String(candidate.type)}`)
  }

  if (typeof candidate.payload !== 'object' || candidate.payload === null) {
    throw new CommandParseError(`${candidate.type} 의 payload 가 없습니다`)
  }

  return candidate as Command
}

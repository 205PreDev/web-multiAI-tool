import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `CLAUDE.md` 제약 8 — **커맨드가 아닌 경로로 씬을 바꾸지 않는다** — 을 기계가 지킨다.
 *
 * 지금까지 이 규칙은 주석으로만 있었다. 주석은 다음 회차가 안 읽으면 없는 것과 같고, 이 규칙을
 * 어겼을 때 나타나는 증상은 "가끔 되돌리기가 한 칸 모자란다"라서 **어긴 자리에서 드러나지
 * 않는다.** 라이선스 규칙에는 CI 검사를 붙여두고(제약 1) 정작 되돌리기의 기반에는 안 붙여둔
 * 상태였다.
 *
 * 막는 것은 둘이다.
 * 1. 씬을 직접 주무르는 저수준 헬퍼(`scene/mutations`)를 커맨드 계층 밖에서 import 하는 것
 * 2. zustand 의 `setState` 로 스토어를 갈아끼우는 것 — 히스토리를 건너뛴다
 */

const EDITOR_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * `mutations.ts` 의 함수 중 **씬을 바꾸는 것들.** 읽기만 하는 것(`getNode`·`hasNode`·
 * `indexOfNode`·`collectSubtreeIds`·`isDescendant`)은 누가 불러도 되고 실제로 팩토리가 부른다 —
 * 커맨드를 만들려면 현재 상태를 읽어야 하기 때문이다. 막을 것은 읽기가 아니라 쓰기다.
 */
const MUTATORS = ['attachNode', 'detachSubtree', 'detachNodeOnly']

/** 씬을 직접 주무르는 것이 그들의 일인 파일 */
const MUTATION_OWNERS = ['scene/mutations.ts', 'scene/store.ts', 'commands/registry.ts']

/** 테스트는 픽스처를 세우려고 스토어를 갈아끼운다. 그것이 테스트가 하는 일이다 */
const SET_STATE_ALLOWED = (path: string) => path.endsWith('.test.ts')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

/**
 * `scene/mutations` 에서 이름으로 가져온 것들. **import 구문만 본다** — 주석이나 문자열에
 * 이름이 나오는 것은 위반이 아니고, 오히려 왜 그 규칙이 있는지 적어둔 자리인 경우가 많다.
 */
function mutationImports(text: string): string[] {
  const match = /import\s*\{([^}]*)\}\s*from\s*'[^']*scene\/mutations'/s.exec(text)
  if (!match?.[1]) return []

  return match[1]
    .split(',')
    .map(
      (entry) =>
        entry
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim() ?? '',
    )
    .filter(Boolean)
}

function editorSources(): { path: string; text: string }[] {
  return sourceFiles(EDITOR_ROOT).map((full) => ({
    path: relative(EDITOR_ROOT, full).replaceAll('\\', '/'),
    text: readFileSync(full, 'utf8'),
  }))
}

describe('제약 8 — 씬은 커맨드로만 바뀐다', () => {
  it('검사할 파일을 실제로 찾았다', () => {
    // 경로가 어긋나 0개를 훑고 통과하는 것이 이런 검사의 흔한 실패 방식이다
    const paths = editorSources().map((file) => file.path)
    expect(paths.length).toBeGreaterThan(5)
    expect(paths).toContain('scene/store.ts')
  })

  it('씬을 바꾸는 저수준 함수를 커맨드 계층 밖에서 import 하지 않는다', () => {
    const offenders = editorSources()
      .filter((file) => !MUTATION_OWNERS.includes(file.path))
      .filter((file) => mutationImports(file.text).some((name) => MUTATORS.includes(name)))
      .map((file) => file.path)

    expect(offenders).toStrictEqual([])
  })

  it('네임스페이스 import 로 우회하지 않는다', () => {
    // `import * as mutations` 로 받으면 위의 이름 검사가 통째로 비켜간다
    const offenders = editorSources()
      .filter((file) => !MUTATION_OWNERS.includes(file.path))
      .filter((file) => /import\s+\*\s+as\s+\w+\s+from\s+'[^']*scene\/mutations'/.test(file.text))
      .map((file) => file.path)

    expect(offenders).toStrictEqual([])
  })

  it('막으려는 이름이 실제로 존재한다', () => {
    // 함수 이름이 바뀌면 위 검사가 아무것도 안 걸고 조용히 통과한다
    const mutations = editorSources().find((file) => file.path === 'scene/mutations.ts')

    for (const name of MUTATORS) {
      expect(mutations?.text, name).toContain(`export function ${name}`)
    }
  })

  it('스토어의 setState 로 씬을 갈아끼우지 않는다', () => {
    const offenders = editorSources()
      .filter((file) => !SET_STATE_ALLOWED(file.path))
      .filter((file) => /useEditorStore\.setState/.test(file.text))
      .map((file) => file.path)

    expect(offenders).toStrictEqual([])
  })
})

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **N-14 — 컴포넌트에 리터럴 색을 쓰지 않는다.**
 *
 * `docs/UX.md` 6절이 "이 규칙은 린트로 강제합니다"라고 못박았다. oxlint 는 CSS 를 보지 않고
 * TSX 안의 문자열이 색인지도 모르므로, 규칙을 지키는 것은 이 검사다.
 *
 * 막는 이유는 테마다. **라이트 갤러리와 다크 에디터는 semantic 토큰의 값 교체로만 갈라져야
 * 하는데**(N-14), 컴포넌트에 색이 한 번 박히면 그 색만 테마를 따라가지 않는다. 그리고 그
 * 증상은 "라이트 모드에서 어떤 글자가 안 보인다"라서 박은 자리에서 드러나지 않는다.
 *
 * ---
 *
 * **토큰이 덮는 범위는 UI 크롬이다.** 씬 안 오브젝트의 머티리얼 색은 사용자가 편집하는
 * 콘텐츠이고 씬 그래프에 저장되어 glTF 로 나가므로 토큰의 대상이 아니다. 그래서 예외가
 * 파일 단위로 하나 있고, 그 예외가 조용히 넓어지지 않도록 아래에서 함께 검사한다.
 */

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * 리터럴 색을 써도 되는 자리.
 *
 * - `ui/tokens.css` — 팔레트 그 자체. 여기 말고는 색이 태어날 곳이 없다
 * - `ui/cssTokens.ts` — 토큰을 못 찾았을 때의 표시색. 못 찾은 것을 눈에 띄게 하는 것이 일이다
 * - `editor/commands/factories.ts` — **씬 콘텐츠의 기본 머티리얼.** UI 크롬이 아니다
 */
const COLOR_ALLOWED = ['ui/tokens.css', 'ui/cssTokens.ts', 'editor/commands/factories.ts'] as const

const HEX = /#[0-9a-fA-F]{3,8}\b/
const FUNCTIONAL = /\b(?:rgba?|hsla?|color|oklch|lab)\(/

/**
 * 이름 있는 색과 시스템 색. **`#` 만 찾으면 `color: white` 가 그대로 통과한다.**
 *
 * `transparent` · `currentColor` · `inherit` 은 값이 아니라 참조라 뺀다.
 * 뒤에 `-` 나 글자가 오면 다른 속성명이므로(`white-space`) 걸지 않는다.
 */
const NAMES =
  'white|black|red|blue|green|yellow|orange|purple|pink|brown|gray|grey|silver|gold|cyan|magenta|lime|navy|teal|olive|maroon|aqua|fuchsia|ButtonFace|ButtonText|ButtonBorder|CanvasText|HighlightText'

const NAMED_IN_CSS = new RegExp(`\\b(?:${NAMES})\\b(?![-\\w])`)

/**
 * TS 에서는 **따옴표 안에 있을 때만** 색으로 센다.
 *
 * 맨 이름까지 걸면 식별자를 오탐한다 — `Canvas` 는 R3F 컴포넌트이고 `Field` 는 흔한 변수명이다.
 * 색으로 쓰이는 경우는 `<meshBasicMaterial color="red">` 처럼 반드시 문자열이다.
 */
const NAMED_IN_TS = new RegExp(`['"\`](?:${NAMES})['"\`]`)

function hasLiteralColor(path: string, text: string): boolean {
  if (HEX.test(text) || FUNCTIONAL.test(text)) return true
  return path.endsWith('.css') ? NAMED_IN_CSS.test(text) : NAMED_IN_TS.test(text)
}

/**
 * 주석은 보지 않는다. 왜 그 규칙이 있는지 설명하면서 색을 예로 드는 자리가 실제로 있고,
 * 그것을 위반으로 세면 설명을 적을 수 없게 된다.
 */
function stripComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(?:tsx?|css)$/.test(entry) ? [full] : []
  })
}

function sources(): { path: string; text: string }[] {
  return sourceFiles(SRC_ROOT).map((full) => ({
    path: relative(SRC_ROOT, full).replaceAll('\\', '/'),
    text: readFileSync(full, 'utf8'),
  }))
}

function cssModules() {
  return sources().filter((file) => file.path.endsWith('.module.css'))
}

/** `tokens.css` 가 정의하는 이름 전부 */
function definedTokens(): Set<string> {
  const tokens = sources().find((file) => file.path === 'ui/tokens.css')
  return new Set(
    [...(tokens?.text ?? '').matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1] ?? ''),
  )
}

/**
 * 토큰 이름을 참조하는 자리 전부.
 *
 * **CSS 만 훑으면 절반을 놓친다.** 뷰포트 크롬의 색은 `cssTokens.ts` 를 거쳐 TS 문자열로
 * 참조되고(`Scene.tsx` · `SceneNodes.tsx` · `AxisGizmo.tsx`), 거기 오타가 나면 CSS 처럼
 * 조용히 무시되는 것이 아니라 마젠타가 화면에 그려진다 — 눈에는 띄지만 CI 는 통과한다.
 * `tokens.css` 자신의 `var()` 참조도 본다. semantic 이 없는 primitive 를 가리키는 오타가
 * 거기서 나면 그 아래 전부가 함께 무너진다.
 */
function tokenReferences(): { path: string; name: string }[] {
  return sources()
    .filter((file) => !file.path.endsWith('.test.ts'))
    .flatMap((file) => {
      const text = stripComments(file.text)
      // TS 는 따옴표 세 종류를 전부 본다 — 한 종류만 보면 나머지로 쓴 오타가 검사 밖이다
      const pattern = file.path.endsWith('.css') ? /var\((--[\w-]+)/g : /['"`](--[\w-]+)['"`]/g

      return [...text.matchAll(pattern)].map((match) => ({ path: file.path, name: match[1] ?? '' }))
    })
}

/**
 * 색 primitive 를 직접 참조하는 자리.
 *
 * **CSS 와 TS 를 함께 본다.** 뷰포트 크롬은 토큰 이름을 TS 문자열로 넘기므로, CSS 만 보면
 * `useTokenColors(['--p-blue-500'])` 이 그냥 통과한다 — 그 값은 테마를 따라가지 않는다.
 */
function primitiveColorReferences(): { path: string; name: string }[] {
  const isColorPrimitive = /^--p-(?:gray|blue|amber|red|green|white|black|axis)/

  return tokenReferences().filter(
    (reference) => reference.path !== 'ui/tokens.css' && isColorPrimitive.test(reference.name),
  )
}

/*
 * ── 대비 (`docs/UX.md` 6절 — 라이트·다크 모두에서 4.5:1 이상) ──────────────
 *
 * **문서에만 적어두면 다음 테마 변경이 조용히 깨뜨린다.** 어느 값이 어느 배경 위에 얹히는지는
 * 컴포넌트 CSS 가 알고 있고, 그것을 사람이 매번 다시 계산할 수는 없다.
 */

/** `tokens.css` 의 선언을 테마별로 갈라 읽는다 */
function declarations(theme: 'dark' | 'light'): Map<string, string> {
  const text = sources().find((file) => file.path === 'ui/tokens.css')?.text ?? ''
  const values = new Map<string, string>()

  for (const block of text.split('}')) {
    const [selector, body] = block.split('{')
    if (body === undefined) continue

    // 라이트 블록은 라이트를 읽을 때만 얹는다. 나머지(:root · dark)는 양쪽의 바탕이다
    const isLightBlock = selector?.includes("[data-theme='light']") ?? false
    if (isLightBlock && theme !== 'light') continue

    for (const match of stripComments(body).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (match[1] && match[2]) values.set(match[1], match[2].trim())
    }
  }

  return values
}

/** `var()` 사슬을 끝까지 따라가 실제 값을 얻는다. 색이 아니면 `null` */
function resolveHex(name: string, values: Map<string, string>): string | null {
  let value = values.get(name)

  for (let depth = 0; depth < 8 && value; depth += 1) {
    const reference = /^var\((--[\w-]+)\)$/.exec(value)
    if (!reference?.[1]) break
    value = values.get(reference[1])
  }

  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}

function contrast(foreground: string, background: string): number {
  const [darker, lighter] = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

/**
 * 실제로 겹쳐 그려지는 조합. **컴포넌트 CSS 를 보고 적었다** — 여기 없는 조합이 화면에 생기면
 * 이 검사는 그것을 모른다. 조합을 더할 때 함께 적는 것이 규약이다.
 */
const TEXT_PAIRS: [foreground: string, background: string][] = [
  ['--c-text-primary', '--c-surface-base'],
  ['--c-text-primary', '--c-surface-raised'],
  ['--c-text-primary', '--c-surface-overlay'],
  ['--c-text-secondary', '--c-surface-raised'],
  ['--c-text-muted', '--c-surface-base'],
  ['--c-text-muted', '--c-surface-raised'],
  ['--c-text-muted', '--c-surface-overlay'],
  ['--c-status-ok', '--c-surface-raised'],
  ['--c-status-warn', '--c-surface-raised'],
  ['--c-status-danger', '--c-surface-raised'],
  ['--c-status-danger', '--c-surface-overlay'],
  ['--c-accent-contrast', '--c-accent'],
]

const MIN_TEXT_CONTRAST = 4.5

describe('UX 6절 — 라이트·다크 모두에서 대비 4.5:1 이상', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`${theme} 테마의 글자 조합이 전부 기준을 넘는다`, () => {
      const values = declarations(theme)
      const failures: string[] = []

      for (const [foreground, background] of TEXT_PAIRS) {
        const front = resolveHex(foreground, values)
        const back = resolveHex(background, values)

        // 값을 못 읽었으면 통과가 아니라 실패다 — 못 읽는 검사는 아무것도 지키지 않는다
        if (!front || !back) {
          failures.push(`${foreground} on ${background}: 색을 얻지 못했습니다`)
          continue
        }

        const ratio = contrast(front, back)
        if (ratio < MIN_TEXT_CONTRAST) {
          failures.push(`${foreground} on ${background}: ${ratio.toFixed(2)}:1`)
        }
      }

      expect(failures).toStrictEqual([])
    })
  }

  it('대비 계산이 실제로 무는지 확인한다', () => {
    // 계산이 늘 큰 수를 돌려주면 위의 단언은 무엇을 넣어도 통과한다
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrast('#ef4444', '#ffffff')).toBeLessThan(MIN_TEXT_CONTRAST)
  })

  it('테마마다 다른 값을 읽고 있다', () => {
    // 라이트 블록을 못 읽고 다크 값을 두 번 검사하면 라이트는 영영 검사되지 않는다
    const dark = resolveHex('--c-surface-base', declarations('dark'))
    const light = resolveHex('--c-surface-base', declarations('light'))

    expect(dark).not.toBeNull()
    expect(light).not.toBeNull()
    expect(dark).not.toBe(light)
  })
})

/**
 * 간격은 눈금 위에 있어야 한다.
 *
 * N-14는 "리터럴 색**·치수**를 쓰지 않습니다"라고 적었다. 색만 막고 치수를 놓아두면 요구사항의
 * 절반을 수행자가 임의로 좁힌 것이 된다.
 *
 * **다만 막는 것은 `--p-space-*` 눈금이 실제로 덮는 것들 — 여백과 사이 간격뿐이다.** 패널의
 * 고정 폭(260px)이나 줄 높이(24px)처럼 눈금이 없는 일회성 치수까지 토큰으로 만들면 토큰이
 * 이름 붙은 상수 창고가 되고, 그것은 디자인 시스템이 아니다. **이 구분은 아직 요구사항에
 * 없으므로 `TODO.md` 에 남은 항목으로 세워 두었다** — README 에 예외를 적어 덮지 않는다.
 */
const SPACING_PROPERTY =
  /(?:^|[\s;{])(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?\s*:\s*([^;}]+)/g

const RAW_LENGTH = /-?\d+(?:\.\d+)?(?:px|rem|em)/

describe('N-14 — 여백은 간격 토큰으로만 준다', () => {
  it('CSS 모듈의 padding · margin · gap 에 리터럴 길이가 없다', () => {
    const offenders: string[] = []

    for (const file of cssModules()) {
      for (const match of stripComments(file.text).matchAll(SPACING_PROPERTY)) {
        const value = match[1] ?? ''
        if (RAW_LENGTH.test(value)) offenders.push(`${file.path}: ${match[0].trim()}`)
      }
    }

    expect(offenders).toStrictEqual([])
  })

  it('규칙이 실제로 무는지 확인한다', () => {
    const read = (text: string) =>
      [...text.matchAll(SPACING_PROPERTY)].map((match) => match[1]?.trim() ?? '')

    expect(read('  padding: 8px 0;')).toStrictEqual(['8px 0'])
    expect(read('  gap: var(--p-space-2);')).toStrictEqual(['var(--p-space-2)'])
    expect(RAW_LENGTH.test('8px 0')).toBe(true)
    expect(RAW_LENGTH.test('var(--p-space-2)')).toBe(false)
    expect(RAW_LENGTH.test('calc(-1 * var(--p-space-05))')).toBe(false)

    // 훑는 대상이 0개가 아닌지 — 정규식이 아무것도 안 잡으면 위 검사는 늘 통과한다
    const seen = cssModules().flatMap((file) => [
      ...stripComments(file.text).matchAll(SPACING_PROPERTY),
    ])
    expect(seen.length).toBeGreaterThan(20)
  })
})

describe('N-14 — 리터럴 색을 쓰지 않는다', () => {
  it('검사할 파일을 실제로 찾았다', () => {
    // 경로가 어긋나 0개를 훑고 통과하는 것이 이런 검사의 흔한 실패 방식이다
    const paths = sources().map((file) => file.path)
    expect(paths.length).toBeGreaterThan(10)
    expect(paths).toContain('ui/tokens.css')
    expect(cssModules().length).toBeGreaterThan(3)
  })

  it('규칙이 실제로 무는 것을 확인한다', () => {
    // 팔레트에는 색이 있어야 한다. 없다면 정규식이 색을 못 찾고 있다는 뜻이고,
    // 그러면 아래 검사는 무엇을 넣어도 통과한다
    const tokens = sources().find((file) => file.path === 'ui/tokens.css')
    expect(HEX.test(stripComments(tokens?.text ?? ''))).toBe(true)
    expect(FUNCTIONAL.test(stripComments(tokens?.text ?? ''))).toBe(true)

    // 이름 있는 색 규칙은 속성명·식별자를 오탐하면 안 되고, 진짜 색은 잡아야 한다
    expect(hasLiteralColor('a.css', 'white-space: nowrap')).toBe(false)
    expect(hasLiteralColor('a.css', 'color: white')).toBe(true)
    expect(hasLiteralColor('a.css', 'background: ButtonFace')).toBe(true)
    expect(hasLiteralColor('a.tsx', '<Canvas shadows>')).toBe(false)
    expect(hasLiteralColor('a.tsx', '<meshBasicMaterial color="red" />')).toBe(true)
  })

  it('예외로 둔 파일이 실제로 존재한다', () => {
    // 파일 이름이 바뀌면 예외만 남고 검사는 그 파일을 그냥 훑는다 — 반대라면 차라리 낫다
    for (const path of COLOR_ALLOWED) {
      expect(existsSync(join(SRC_ROOT, path)), path).toBe(true)
    }
  })

  it('토큰 정의 밖에 색 리터럴이 없다', () => {
    const offenders = sources()
      .filter((file) => !(COLOR_ALLOWED as readonly string[]).includes(file.path))
      .filter((file) => !file.path.endsWith('.test.ts'))
      .map((file) => ({ path: file.path, text: stripComments(file.text) }))
      .filter((file) => hasLiteralColor(file.path, file.text))
      .map((file) => file.path)

    expect(offenders).toStrictEqual([])
  })

  it('참조하는 토큰이 전부 정의되어 있다 — CSS 와 TS 양쪽', () => {
    // 오타 하나로 `var(--c-surfce-base)` 가 되면 CSS 는 조용히 그 선언만 버린다.
    // 화면은 대체로 멀쩡해 보이고, 어느 요소 하나의 배경만 사라진다
    const defined = definedTokens()
    expect(defined.size).toBeGreaterThan(20)

    const missing = tokenReferences()
      .filter((reference) => !defined.has(reference.name))
      .map((reference) => `${reference.path}: ${reference.name}`)

    expect([...new Set(missing)]).toStrictEqual([])
  })

  it('TS 쪽 토큰 참조를 실제로 찾고 있다', () => {
    // CSS 만 훑고 통과하면 뷰포트 크롬의 토큰 이름은 아무도 검사하지 않는다
    const fromTs = tokenReferences().filter((reference) => /\.tsx?$/.test(reference.path))

    expect(fromTs.length).toBeGreaterThan(5)
    expect(fromTs.map((reference) => reference.path)).toContain('editor/viewport/Scene.tsx')
  })

  it('primitive 토큰의 색을 직접 참조하지 않는다 — CSS 와 TS 양쪽', () => {
    // primitive 는 의미가 없는 값이라 테마를 따라가지 않는다. 색만 막는다 —
    // 간격(`--p-space-*`)과 타이포는 테마와 무관하므로 직접 써도 된다
    const offenders = primitiveColorReferences().map(
      (reference) => `${reference.path}: ${reference.name}`,
    )

    expect(offenders).toStrictEqual([])
  })
})

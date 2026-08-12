import { useMemo, useSyncExternalStore } from 'react'

/**
 * **CSS 토큰을 three.js 머티리얼에 건네주는 다리.**
 *
 * 뷰포트 안의 그리드·선택 외곽선·축 표시는 씬 콘텐츠가 아니라 UI 크롬이므로 N-14의 대상이다.
 * 그런데 그것을 그리는 것은 CSS 가 아니라 three.js 머티리얼이라 `var(--c-…)` 를 쓸 수 없다.
 *
 * 그렇다고 색을 TS 상수로 따로 두면 **같은 색이 두 곳에 적히고 테마 교체 때 한쪽만 바뀐다.**
 * 그래서 정본은 `tokens.css` 하나로 두고 여기서 계산된 값을 읽어 넘긴다.
 */

/** 토큰이 없을 때 돌려주는 값. **눈에 띄어야 하므로 마젠타다** — 조용히 검게 그려지면 못 찾는다 */
const MISSING = '#ff00ff'

export function readToken(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (value) return value

  console.warn(`[ui] 정의되지 않은 토큰입니다: ${name}`)
  return MISSING
}

export function readTokens<T extends string>(names: readonly T[]): Record<T, string> {
  const computed = getComputedStyle(document.documentElement)

  return Object.fromEntries(
    names.map((name) => {
      const value = computed.getPropertyValue(name).trim()
      if (!value) console.warn(`[ui] 정의되지 않은 토큰입니다: ${name}`)
      return [name, value || MISSING]
    }),
  ) as Record<T, string>
}

/**
 * `<html data-theme>` 를 구독한다.
 *
 * 값을 한 번만 읽고 캐시하면 테마를 바꿨을 때 **CSS 로 그린 것만 바뀌고 뷰포트는 이전 테마에
 * 남는다.** 지금은 테마 전환 UI 가 없어 눈에 띄지 않지만, 그때 가서 고치려면 이 값을 읽는
 * 자리를 전부 찾아야 한다.
 */
function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function themeSnapshot(): string {
  return document.documentElement.dataset['theme'] ?? 'dark'
}

export function useTheme(): string {
  return useSyncExternalStore(subscribeTheme, themeSnapshot, () => 'dark')
}

/**
 * 토큰 여러 개를 읽어 테마가 바뀌면 다시 읽는다.
 *
 * `names` 는 **모듈 수준 상수여야 한다.** 렌더마다 새 배열을 만들면 매 프레임 `getComputedStyle`
 * 을 부르게 되고, 그것은 레이아웃을 강제로 계산시킨다.
 */
export function useTokenColors<T extends string>(names: readonly T[]): Record<T, string> {
  const theme = useTheme()

  // `names` 의 정체성이 캐시의 키다 — 모듈 수준 상수라는 위의 조건이 여기에 걸린다.
  // `theme` 는 memo 본문에 나타나지 않지만 결과가 그것에 의존한다 — 읽어오는 값이 DOM 의
  // 현재 테마에서 나오기 때문이다. 린트는 본문만 보므로 이 의존은 사람이 적어야 한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readTokens(names), [names, theme])
}

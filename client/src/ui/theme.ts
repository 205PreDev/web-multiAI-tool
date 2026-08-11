/**
 * 테마를 URL 질의로 갈아끼운다 — `?theme=light`.
 *
 * **검증 수단이지 기능이 아니다.** 에디터는 다크 기본이고 공개 화면은 양쪽을 지원하는데
 * (N-14), 공개 화면은 9단계이므로 지금 라이트 테마를 화면으로 확인할 방법이 없다.
 * `designTokens.test.ts` 가 대비를 계산하지만 그것이 확인해 주지 않는 것이 있다 —
 * **읽히는가, 그리고 어색하지 않은가.**
 *
 * `?renderer=` 와 같은 방식이며 쓰는 법도 같은 자리(`CLAUDE.md` 실행 절)에 적어둔다.
 * 사용자 설정으로 바꾸는 것은 공개 화면을 만들 때 함께 정한다.
 */

const THEMES = new Set(['light', 'dark'])

export function applyThemeFromUrl(search: string = window.location.search): void {
  const requested = new URLSearchParams(search).get('theme')
  if (requested === null) return

  if (!THEMES.has(requested)) {
    console.warn(`[ui] 모르는 테마입니다: ${requested}`)
    return
  }

  // `data-theme` 을 바꾸면 CSS 는 물론 뷰포트 안의 색도 따라온다 — `cssTokens.ts` 가
  // 이 속성을 구독하고 있다. 그것이 실제로 도는지 확인하는 것도 이 질의의 쓸모다.
  document.documentElement.dataset['theme'] = requested
}

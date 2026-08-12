import { IDENTITY_TRANSFORM, type NodeKind, type Transform } from './types'

/**
 * 노드 종류별 표시 이름과 추가 시의 기본 배치 (A-11).
 *
 * **한 곳에 모으는 이유는 이름이 세 군데에 필요하기 때문이다** — 추가 메뉴, 아웃라이너의
 * 행, 상태 바의 선택 표시. 세 곳에 따로 적으면 종류를 더할 때 한 곳을 빠뜨린다.
 *
 * `glyph` 는 장식이 아니라 종류 구분이다. **`docs/UX.md` 6절이 색만으로 상태를 구분하지 말라고
 * 했으므로 글리프와 이름을 함께 둔다** — 글리프만으로는 읽히지 않고, 이름만으로는 훑기 어렵다.
 */

export interface KindInfo {
  label: string
  glyph: string
  /** 추가 메뉴의 묶음. `null` 이면 메뉴에 내놓지 않는다 */
  group: 'primitive' | 'light' | 'container'
  /** 씬에 넣을 때의 트랜스폼. 바닥을 뚫고 들어가 있으면 사용자가 처음 보는 것이 이상해진다 */
  spawn: Transform
}

/** 프리미티브의 기본 크기가 1이므로 절반만 띄우면 바닥 위에 선다 */
const ON_GROUND: Transform = { ...IDENTITY_TRANSFORM, position: [0, 0.5, 0] }

export const KIND_INFO: Record<NodeKind, KindInfo> = {
  group: {
    label: '그룹',
    glyph: '▤',
    group: 'container',
    spawn: IDENTITY_TRANSFORM,
  },
  box: { label: '박스', glyph: '■', group: 'primitive', spawn: ON_GROUND },
  sphere: { label: '구', glyph: '●', group: 'primitive', spawn: ON_GROUND },
  cylinder: { label: '원기둥', glyph: '⬮', group: 'primitive', spawn: ON_GROUND },
  plane: {
    label: '평면',
    glyph: '▬',
    group: 'primitive',
    // PlaneGeometry 는 XY 평면에 서 있다. 바닥에 눕혀야 사용자가 기대하는 "평면"이 된다.
    //
    // y 를 띄우는 이유는 뷰포트에 이미 두 겹이 있기 때문이다 — 그림자를 받는 바닥(y=0)과
    // 그리드(y=0.002·0.003). y=0 에 놓으면 바닥과 완전 동일 평면이라 z-파이팅 얼룩이 생기고,
    // 그리드 아래에 깔려 선이 위로 비친다. **추가하자마자 화면이 지저분해진다.**
    spawn: { ...IDENTITY_TRANSFORM, position: [0, 0.01, 0], rotation: [-Math.PI / 2, 0, 0] },
  },
  directionalLight: {
    label: '방향광',
    glyph: '☀',
    group: 'light',
    spawn: { ...IDENTITY_TRANSFORM, position: [4, 6, 3] },
  },
  pointLight: {
    label: '점광',
    glyph: '✦',
    group: 'light',
    spawn: { ...IDENTITY_TRANSFORM, position: [0, 3, 0] },
  },
}

export function kindLabel(kind: NodeKind): string {
  return KIND_INFO[kind].label
}

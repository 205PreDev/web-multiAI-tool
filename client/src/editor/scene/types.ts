export type NodeId = string

export type Vec3 = readonly [number, number, number]

export interface Transform {
  position: Vec3
  /** 오일러 XYZ, 라디안 */
  rotation: Vec3
  scale: Vec3
}

export interface MaterialState {
  color: string
  roughness: number
  metalness: number
}

/**
 * 목록을 값으로 두고 타입을 거기서 뽑는다. **밖에서 들어온 커맨드의 `kind` 를 런타임에
 * 검사해야 하기 때문이다**(F-3 · K-4). 타입만 있으면 컴파일 뒤에 아무것도 남지 않는다.
 *
 * ⚠️ **생성·임포트 메시(`mesh`)가 여기 없다.** 한때 있었으나 뺐다 — 종류만 있고 "어떤
 * 메시인가"를 가리킬 필드가 없어서, 넣어도 화면에 아무것도 그려지지 않고 익스포터도 읽을 것이
 * 없었다. 열거형이 못 지킬 약속을 하고 있으면 그 위에 쌓는 코드가 전부 그 약속을 믿는다.
 * **에셋 참조 필드(`assetId` · `versionSeq`)와 함께 3단계에서 돌아온다.**
 */
export const NODE_KINDS = [
  'group',
  'box',
  'sphere',
  'cylinder',
  'plane',
  'directionalLight',
  'pointLight',
] as const

export type NodeKind = (typeof NODE_KINDS)[number]

/**
 * ⚠️ **이 모델은 아직 데모 A의 뒤 단계를 담지 못한다.** 지금 담기는 것은 프리미티브와 라이트의
 * 트랜스폼·머티리얼까지다. 앞으로 자리를 파야 하는 것 —
 *
 * | 필요 | 언제 |
 * | --- | --- |
 * | 에셋 참조 (`assetId` · `versionSeq`) — 생성·임포트 메시 | 3단계 |
 * | 스켈레톤·스킨 | 4단계 (C-3) |
 * | 애니메이션 클립과 이벤트 마커 | 5단계 (D-2 · D-3) |
 * | 오디오 바인딩 — `extras.wmt` 로 나갈 값 | 6단계 (E-3), `docs/WMT_SCHEMA.md` |
 * | 임의 메타데이터 | 1단계 인스펙터 (A-4) |
 *
 * 지금 미리 만들지 않는 이유는 그때 필요한 모양을 아직 모르기 때문이고, **그래도 나중에 넣을 수
 * 있는 이유는 커맨드에 `version` 이 있기 때문이다** — 필드가 늘어도 옛 커맨드를 "구버전"이라고
 * 말할 수 있다. 그 자리가 없었으면 리비전에 남은 커맨드와 호환이 끊긴다.
 */
export interface SceneNode {
  id: NodeId
  name: string
  kind: NodeKind
  transform: Transform
  /** 라이트와 group 에는 없다. **키 자체를 두지 않는다** — `undefined` 는 JSON 왕복에서 사라진다 */
  material?: MaterialState
  parentId: NodeId | null
  childIds: readonly NodeId[]
}

/**
 * 씬 그래프는 정규화된 평면 데이터다.
 *
 * three.js 공식 에디터는 `THREE.Object3D` 트리를 직접 들고 다니지만, 여기서는 그렇게 하지
 * 않는다. 이 프로젝트의 커맨드는 **JSON 으로 오가고 결정적으로 재생돼야** 하는데(협업 K-4),
 * 그 요구는 렌더 객체가 아니라 평면 데이터 위에서 훨씬 싸게 만족된다. R3F 가 이 데이터를
 * 보고 씬을 그리므로 three 객체는 렌더러 쪽에만 존재한다.
 *
 * 차용한 것은 Command 패턴 — 커맨드 객체 · 실행/되돌리기 · History 스택 — 이고,
 * 데이터 모델은 이 프로젝트의 요구에 맞췄다.
 */
export interface SceneState {
  nodes: Readonly<Record<NodeId, SceneNode>>
  rootIds: readonly NodeId[]
}

export const IDENTITY_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}

export const EMPTY_SCENE: SceneState = { nodes: {}, rootIds: [] }

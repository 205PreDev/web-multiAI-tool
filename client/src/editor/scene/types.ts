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
 * `mesh` 는 생성·임포트로 들어온 메시로, 지오메트리는 에셋으로 따로 보관한다.
 */
export const NODE_KINDS = [
  'group',
  'box',
  'sphere',
  'cylinder',
  'plane',
  'directionalLight',
  'pointLight',
  'mesh',
] as const

export type NodeKind = (typeof NODE_KINDS)[number]

export interface SceneNode {
  id: NodeId
  name: string
  kind: NodeKind
  transform: Transform
  /** 라이트와 group 에는 없다 */
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

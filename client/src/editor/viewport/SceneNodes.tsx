import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { DEFAULT_MATERIAL } from '../commands'
import { useEditorStore } from '../scene/store'
import { useTokenColors } from '../../ui/cssTokens'
import type { NodeId, NodeKind } from '../scene/types'

/**
 * 씬 그래프 스토어를 그대로 그린다. **여기서 씬을 바꾸지 않는다** — 변경은 전부 커맨드를
 * 거치고, 이 컴포넌트는 그 결과를 비추기만 한다. 예외는 선택인데, 선택은 씬 데이터가 아니라
 * 화면 상태라 히스토리에 남지 않는다.
 */

/**
 * 지오메트리는 종류마다 하나씩만 만들어 공유한다. 노드마다 만들면 같은 박스 백 개가 GPU
 * 버퍼 백 개가 되고, R3F 의 선언형 `<boxGeometry>` 는 노드가 리렌더될 때마다 그것을 다시 만든다.
 */
const GEOMETRY: Record<Exclude<NodeKind, 'group'>, BufferGeometry> = {
  box: new BoxGeometry(1, 1, 1),
  sphere: new SphereGeometry(0.5, 32, 16),
  cylinder: new CylinderGeometry(0.5, 0.5, 1, 32),
  plane: new PlaneGeometry(1, 1),
  // 라이트는 그려질 몸이 없다. 대리 표시가 없으면 **씬 그래프에는 있는데 뷰포트에서는
  // 아무 데도 없는 노드**가 되어, 위치를 옮겨도 무엇이 움직였는지 알 수 없다.
  directionalLight: new SphereGeometry(0.14, 10, 6),
  pointLight: new SphereGeometry(0.14, 10, 6),
}

/** 납작한 경계 상자에 주는 최소 두께 */
const FLAT = 0.001

/**
 * 선택 표시는 **경계 상자의 모서리**다.
 *
 * **drei 의 `Outlines` 를 쓸 수 없다** — raw `ShaderMaterial` 위에 서 있어 WebGPURenderer 가
 * 컴파일하지 못하고 조용히 빠진다(`README.md` 의 호환 표). 대신 three 코어의 `EdgesGeometry`
 * 와 `LineBasicMaterial` 을 쓴다. 둘 다 코어 머티리얼이라 NodeMaterial 로 변환되며, 이미
 * 같은 경로로 그려지고 있는 `gridHelper` 가 그 증거다.
 *
 * ⚠️ **지오메트리에 직접 `EdgesGeometry` 를 걸면 안 된다.** 기본 임계각이 1도라, 구(인접면
 * 사이 약 11도)나 원기둥에서는 모든 삼각형 변이 남아 선 천 개짜리 위경도 그물이 나온다.
 * 아래의 `depthTest={false}` 와 겹치면 그 그물이 씬 전체를 덮는다. 임계각을 올리면 이번에는
 * 구에서 아무 선도 안 남아 선택이 보이지 않는다 — **둥근 것에는 걸 모서리가 없다는 뜻이다.**
 *
 * 그래서 종류마다 다르게 하지 않고 전부 경계 상자로 통일한다. 박스·평면에서는 형태와
 * 일치하고, 둥근 것에서는 12개의 선으로 "이것이 골라졌다"를 말한다. 3단계의 생성 메시처럼
 * 삼각형이 많은 것이 들어와도 같은 비용이다.
 */
const OUTLINE: Record<Exclude<NodeKind, 'group'>, EdgesGeometry> = Object.fromEntries(
  Object.entries(GEOMETRY).map(([kind, geometry]) => [kind, boundsOutline(geometry)]),
) as Record<Exclude<NodeKind, 'group'>, EdgesGeometry>

function boundsOutline(geometry: BufferGeometry): EdgesGeometry {
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) throw new Error('경계 상자를 계산하지 못했습니다')

  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())

  // 평면은 두께가 0이라 상자가 납작해지고, 그러면 마주 보는 두 면이 같은 자리에 겹쳐
  // 모서리 판정이 무너진다. 눈에 띄지 않을 만큼만 두께를 준다
  const box = new BoxGeometry(size.x || FLAT, size.y || FLAT, size.z || FLAT)
  box.translate(center.x, center.y, center.z)

  const edges = new EdgesGeometry(box)
  box.dispose()
  return edges
}

const TOKENS = ['--c-viewport-selection', '--c-viewport-light-proxy'] as const

interface Palette {
  selection: string
  lightProxy: string
}

function SelectionEdges({ kind, color }: { kind: Exclude<NodeKind, 'group'>; color: string }) {
  return (
    <lineSegments geometry={OUTLINE[kind]} renderOrder={2} raycast={() => null}>
      {/* 오브젝트에 가려도 보여야 한다 — 뒤에 있는 것을 골랐을 때 선택이 사라지면 안 된다 */}
      <lineBasicMaterial color={color} depthTest={false} toneMapped={false} />
    </lineSegments>
  )
}

function NodeView({ id, palette }: { id: NodeId; palette: Palette }) {
  const node = useEditorStore((state) => state.scene.nodes[id])
  const isSelected = useEditorStore((state) => state.selectedIds.includes(id))
  const select = useEditorStore((state) => state.select)

  if (!node) return null

  const { transform, material, childIds } = node
  const children = childIds.map((childId) => (
    <NodeView key={childId} id={childId} palette={palette} />
  ))

  if (node.kind === 'group') {
    return (
      <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
        {children}
      </group>
    )
  }

  const isLight = node.kind === 'directionalLight' || node.kind === 'pointLight'

  const body = (
    <mesh
      geometry={GEOMETRY[node.kind]}
      castShadow={!isLight}
      receiveShadow={!isLight}
      onClick={(event) => {
        // 겹쳐 있으면 가장 앞의 것 하나만 고른다. 막지 않으면 뒤의 것까지 함께 반응한다
        event.stopPropagation()
        select([id])
      }}
    >
      {isLight ? (
        <meshBasicMaterial color={palette.lightProxy} toneMapped={false} />
      ) : (
        <meshStandardMaterial
          color={material?.color ?? DEFAULT_MATERIAL.color}
          roughness={material?.roughness ?? DEFAULT_MATERIAL.roughness}
          metalness={material?.metalness ?? DEFAULT_MATERIAL.metalness}
          // 평면은 한 면만 그려져 뒤에서 보면 사라진다. 사용자에게는 그것이 삭제로 보인다
          side={node.kind === 'plane' ? DoubleSide : undefined}
        />
      )}
      {isSelected ? <SelectionEdges kind={node.kind} color={palette.selection} /> : null}
    </mesh>
  )

  // 라이트도 group 으로 감싼다. 라이트 요소에 position 만 주면 **자식과 회전·스케일이
  // 사라져** 씬 그래프에는 있는 노드가 화면에서 없어진다 — 계층 이동(reparentNode)은
  // 어떤 종류 밑으로든 허용되므로 아웃라이너(A-2)와 뷰포트가 서로 다른 것을 말하게 된다.
  return (
    <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      {node.kind === 'directionalLight' ? <directionalLight intensity={2} castShadow /> : null}
      {node.kind === 'pointLight' ? <pointLight intensity={2} castShadow /> : null}
      {body}
      {children}
    </group>
  )
}

export function SceneNodes() {
  const rootIds = useEditorStore((state) => state.scene.rootIds)
  const tokens = useTokenColors(TOKENS)

  const palette: Palette = {
    selection: tokens['--c-viewport-selection'],
    lightProxy: tokens['--c-viewport-light-proxy'],
  }

  return (
    <>
      {rootIds.map((id) => (
        <NodeView key={id} id={id} palette={palette} />
      ))}
    </>
  )
}

import { useEditorStore } from '../scene/store'
import type { NodeId, SceneNode } from '../scene/types'

/**
 * 씬 그래프 스토어를 그대로 그린다. **여기서 씬을 바꾸지 않는다** — 변경은 전부 커맨드를
 * 거치고, 이 컴포넌트는 그 결과를 비추기만 한다.
 */

function Geometry({ kind }: { kind: SceneNode['kind'] }) {
  switch (kind) {
    case 'box':
      return <boxGeometry args={[1, 1, 1]} />
    case 'sphere':
      return <sphereGeometry args={[0.5, 32, 16]} />
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
    case 'plane':
      return <planeGeometry args={[1, 1]} />
    default:
      return null
  }
}

function NodeView({ id }: { id: NodeId }) {
  const node = useEditorStore((state) => state.scene.nodes[id])
  if (!node) return null

  const { transform, material, childIds } = node
  const children = childIds.map((childId) => <NodeView key={childId} id={childId} />)

  if (node.kind === 'group') {
    return (
      <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
        {children}
      </group>
    )
  }

  // 라이트도 group 으로 감싼다. 라이트 요소에 position 만 주면 **자식과 회전·스케일이
  // 사라져** 씬 그래프에는 있는 노드가 화면에서 없어진다 — 계층 이동(reparentNode)은
  // 어떤 종류 밑으로든 허용되므로 아웃라이너(A-2)와 뷰포트가 서로 다른 것을 말하게 된다.
  // 라이트를 감싼 group 의 원점에 두므로 월드 위치는 이전과 같다.
  if (node.kind === 'directionalLight' || node.kind === 'pointLight') {
    return (
      <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
        {node.kind === 'directionalLight' ? (
          <directionalLight intensity={2} castShadow />
        ) : (
          <pointLight intensity={2} castShadow />
        )}
        {children}
      </group>
    )
  }

  return (
    <mesh
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
      castShadow
      receiveShadow
    >
      <Geometry kind={node.kind} />
      <meshStandardMaterial
        color={material?.color ?? '#c9ced6'}
        roughness={material?.roughness ?? 0.5}
        metalness={material?.metalness ?? 0}
      />
      {children}
    </mesh>
  )
}

export function SceneNodes() {
  const rootIds = useEditorStore((state) => state.scene.rootIds)

  return (
    <>
      {rootIds.map((id) => (
        <NodeView key={id} id={id} />
      ))}
    </>
  )
}

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

  if (node.kind === 'directionalLight') {
    return <directionalLight position={transform.position} intensity={2} castShadow />
  }

  if (node.kind === 'pointLight') {
    return <pointLight position={transform.position} intensity={2} castShadow />
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

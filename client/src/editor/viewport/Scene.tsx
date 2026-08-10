import { Grid, OrbitControls } from '@react-three/drei'

/**
 * 0단계의 빈 씬. 렌더러가 실제로 그리는지 확인할 최소 구성만 둔다.
 * 씬 그래프와 선택·기즈모는 1단계다.
 */
export function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={2} castShadow />

      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.45} metalness={0.05} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.28} />
      </mesh>

      <Grid
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        sectionSize={2.5}
        sectionThickness={1.1}
        fadeDistance={30}
        infiniteGrid
      />

      <OrbitControls makeDefault enableDamping target={[0, 0.5, 0]} />
    </>
  )
}

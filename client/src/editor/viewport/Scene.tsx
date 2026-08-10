import { GizmoHelper, OrbitControls } from '@react-three/drei'
import { AxisGizmo } from './AxisGizmo'
import { SceneDiagnostics } from './SceneDiagnostics'

/**
 * 0단계의 빈 씬. 렌더러가 실제로 그리는지 확인할 최소 구성만 둔다.
 * 씬 그래프와 선택·기즈모는 1단계다.
 *
 * **그리드는 drei 의 `Grid` 가 아니라 three 코어의 `GridHelper` 를 쓴다.**
 * `Grid` 는 raw `ShaderMaterial` 위에 서 있어 WebGPURenderer 가 컴파일하지 못하고
 * 조용히 빠진다. 자세한 것은 `client/src/editor/viewport/README.md`.
 */
export function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        // 기본 그림자 절두체(±5)는 이 씬에 지나치게 넓어 텍셀이 굵어진다.
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-normalBias={0.02}
      />

      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.45} metalness={0.05} />
      </mesh>

      {/* 그림자만 받는 바닥. 면 자체는 보이지 않는다. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.32} />
      </mesh>

      {/* 그리드 두 겹 — 촘촘한 것과 굵은 것. y 를 조금씩 띄워 바닥과 z-파이팅을 피한다. */}
      <gridHelper
        args={[40, 80, '#2a313c', '#232a33']}
        position={[0, 0.002, 0]}
        material-transparent
        material-opacity={0.55}
      />
      <gridHelper
        args={[40, 16, '#4a90d9', '#3d4552']}
        position={[0, 0.003, 0]}
        material-transparent
        material-opacity={0.75}
      />

      <OrbitControls makeDefault enableDamping target={[0, 0.5, 0]} />

      {/* 화면 우측 하단의 방향 표시. 축을 누르면 그 방향으로 카메라가 돈다.
          위젯이 drei 의 GizmoViewport 가 아닌 이유는 AxisGizmo.tsx 에 적었다. */}
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <AxisGizmo />
      </GizmoHelper>

      <SceneDiagnostics />
    </>
  )
}

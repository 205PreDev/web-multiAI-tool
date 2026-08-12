import { GizmoHelper, OrbitControls } from '@react-three/drei'
import { useTokenColors } from '../../ui/cssTokens'
import { AxisGizmo } from './AxisGizmo'
import { SceneDiagnostics } from './SceneDiagnostics'
import { SceneNodes } from './SceneNodes'

/**
 * 뷰포트의 씬 (A-1) — 궤도 카메라 · 그리드 · 그림자.
 *
 * **그리드는 drei 의 `Grid` 가 아니라 three 코어의 `GridHelper` 를 쓴다.**
 * `Grid` 는 raw `ShaderMaterial` 위에 서 있어 WebGPURenderer 가 컴파일하지 못하고
 * 조용히 빠진다. 자세한 것은 `client/src/editor/viewport/README.md`.
 *
 * 그리드 색은 UI 크롬이므로 디자인 토큰에서 읽는다(N-14). CSS 가 아니라 three 머티리얼이
 * 쓰는 값이라 `var()` 를 넘길 수 없어 `ui/cssTokens.ts` 가 계산된 값을 꺼내 온다.
 */

const TOKENS = [
  '--c-viewport-grid-fine',
  '--c-viewport-grid-fine-sub',
  '--c-viewport-grid-major',
  '--c-viewport-grid-major-sub',
] as const

export function Scene() {
  const tokens = useTokenColors(TOKENS)

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

      <SceneNodes />

      {/* 그림자만 받는 바닥. 면 자체는 보이지 않는다. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.32} />
      </mesh>

      {/* 그리드 두 겹 — 촘촘한 것과 굵은 것. y 를 조금씩 띄워 바닥과 z-파이팅을 피한다. */}
      <gridHelper
        args={[40, 80, tokens['--c-viewport-grid-fine'], tokens['--c-viewport-grid-fine-sub']]}
        position={[0, 0.002, 0]}
        material-transparent
        material-opacity={0.55}
      />
      <gridHelper
        args={[40, 16, tokens['--c-viewport-grid-major'], tokens['--c-viewport-grid-major-sub']]}
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

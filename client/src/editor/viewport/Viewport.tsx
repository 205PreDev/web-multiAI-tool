import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { useEditorStore } from '../scene/store'
import { createRenderer } from './createRenderer'
import { readRendererRequest } from './rendererReport'
import { Scene } from './Scene'
import { ViewportErrorBoundary } from './ViewportErrorBoundary'
import styles from './Viewport.module.css'

export function Viewport() {
  // 요청은 한 번만 읽는다. 렌더러는 Canvas 마운트 시점에 한 번 만들어지므로
  // 이후 URL이 바뀌어도 이미 만들어진 렌더러에는 반영되지 않는다.
  const request = useMemo(() => readRendererRequest(window.location.search), [])
  const select = useEditorStore((state) => state.select)

  return (
    <div className={styles.viewport}>
      <ViewportErrorBoundary>
        <Canvas
          shadows
          camera={{ position: [4, 3, 5], fov: 50 }}
          gl={(props) => createRenderer(props, request)}
          // 빈 곳을 누르면 선택을 푼다. R3F 가 드래그와 클릭을 구분해 주므로
          // 카메라를 궤도 회전한 뒤에는 이것이 불리지 않는다.
          //
          // **왼쪽 버튼만 본다.** R3F 는 `contextmenu` 도 클릭으로 세는데, OrbitControls 는
          // 오른쪽 버튼을 패닝에 쓴다 — 패닝하려다 만 오른쪽 클릭 한 번이 선택을 지운다
          onPointerMissed={(event) => {
            if (event.button === 0) select([])
          }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </ViewportErrorBoundary>
    </div>
  )
}

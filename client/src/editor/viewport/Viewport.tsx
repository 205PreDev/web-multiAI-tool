import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { createRenderer } from './createRenderer'
import { readRendererRequest } from './rendererReport'
import { Scene } from './Scene'
import { ViewportErrorBoundary } from './ViewportErrorBoundary'
import styles from './Viewport.module.css'

export function Viewport() {
  // 요청은 한 번만 읽는다. 렌더러는 Canvas 마운트 시점에 한 번 만들어지므로
  // 이후 URL이 바뀌어도 이미 만들어진 렌더러에는 반영되지 않는다.
  const request = useMemo(() => readRendererRequest(window.location.search), [])

  return (
    <div className={styles.viewport}>
      <ViewportErrorBoundary>
        <Canvas
          shadows
          camera={{ position: [4, 3, 5], fov: 50 }}
          gl={(props) => createRenderer(props, request)}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </ViewportErrorBoundary>
    </div>
  )
}

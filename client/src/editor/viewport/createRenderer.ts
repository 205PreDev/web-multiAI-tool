import { WebGPURenderer } from 'three/webgpu'
import { useRendererReport, type RendererBackend, type RendererRequest } from './rendererReport'

/**
 * R3F가 넘기는 `canvas` 와 three 가 기대하는 `canvas` 는 같은 이름의 서로 다른 선언이라
 * 구조가 같아도 타입이 호환되지 않는다. 경계에서 한 번만 좁히고 안쪽으로는 퍼뜨리지 않는다.
 */
type CanvasProps = { canvas: unknown }
type ThreeCanvas = HTMLCanvasElement | OffscreenCanvas

function isWebGpuExposed(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/**
 * `navigator.gpu` 를 잠시 감춰 three.js 의 폴백 경로를 태운다. 되돌리는 함수를 돌려준다.
 *
 * 브라우저에서 `gpu` 는 보통 `Navigator.prototype` 의 접근자이므로 소유 속성으로 덮으면
 * 가려지고, 지우면 다시 드러난다. 다만 소유 속성인 구현이 있을 수 있어 원래 서술자를
 * 보관했다가 그대로 되돌린다 — 검증용 코드가 브라우저 상태를 망가뜨리면 안 된다.
 */
function hideWebGpu(): () => void {
  if (!isWebGpuExposed()) return () => {}

  const ownDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
  Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })

  return () => {
    if (ownDescriptor) {
      Object.defineProperty(navigator, 'gpu', ownDescriptor)
    } else {
      delete (navigator as unknown as Record<string, unknown>).gpu
    }
  }
}

function readBackend(renderer: WebGPURenderer): RendererBackend {
  // three.js 는 폴백이 일어나면 init 중에 backend 를 WebGLBackend 로 교체한다.
  // 따라서 init 이후의 이 값이 실제로 무엇이 도는지에 대한 유일한 정답이다.
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean }
  return backend?.isWebGPUBackend ? 'webgpu' : 'webgl2'
}

/**
 * WebGPU를 우선 시도하고 WebGL2로 폴백하는 렌더러를 만든다.
 *
 * 폴백 자체는 three.js가 `getFallback` 으로 처리하므로 여기서 구현하지 않는다.
 * 이 함수가 하는 일은 **어느 백엔드가 실제로 선택됐는지 확정해 보고**하는 것이다 —
 * 폴백이 조용히 일어나면 성능 문제의 원인을 나중에 짚을 수 없다.
 */
export async function createRenderer(
  props: CanvasProps,
  request: RendererRequest,
): Promise<WebGPURenderer> {
  const webgpuExposed = isWebGpuExposed()
  const restoreWebGpu = request === 'simulate-no-webgpu' ? hideWebGpu() : () => {}

  const renderer = new WebGPURenderer({
    canvas: props.canvas as ThreeCanvas,
    antialias: true,
    forceWebGL: request === 'force-webgl2',
  })

  try {
    await renderer.init()
  } finally {
    restoreWebGpu()
  }

  const backend = readBackend(renderer)
  useRendererReport.getState().setReport({
    request,
    backend,
    fellBack: request !== 'force-webgl2' && backend === 'webgl2',
    webgpuExposed,
  })

  return renderer
}

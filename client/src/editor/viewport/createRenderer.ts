import { WebGPURenderer } from 'three/webgpu'
import { useRendererReport, type RendererBackend, type RendererRequest } from './rendererReport'

/**
 * R3F가 넘기는 `canvas` 와 three 가 기대하는 `canvas` 는 같은 이름의 서로 다른 선언이라
 * 구조가 같아도 타입이 호환되지 않는다. 경계에서 한 번만 좁히고 안쪽으로는 퍼뜨리지 않는다.
 */
type CanvasProps = { canvas: unknown }
type ThreeCanvas = HTMLCanvasElement | OffscreenCanvas

/**
 * `'gpu' in navigator` 를 쓰지 않는다 — 아래에서 `undefined` 를 소유 속성으로 덮어
 * 감추는데 `in` 은 그것도 참으로 본다. three.js 자신도 `navigator.gpu` 를 곧바로
 * 역참조하므로 같은 기준으로 판정한다.
 */
function isWebGpuExposed(): boolean {
  return typeof navigator !== 'undefined' && navigator.gpu !== undefined
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

async function createOne(props: CanvasProps, request: RendererRequest): Promise<WebGPURenderer> {
  const webgpuExposed = isWebGpuExposed()
  const restoreWebGpu = request === 'simulate-no-webgpu' ? hideWebGpu() : () => {}

  const renderer = new WebGPURenderer({
    // R3F가 정해 보낸 기본값(powerPreference, alpha 등)을 버리지 않는다.
    ...props,
    canvas: props.canvas as ThreeCanvas,
    antialias: true,
    forceWebGL: request === 'force-webgl2',
  })

  try {
    await renderer.init()
  } catch (error) {
    useRendererReport.getState().setReport({
      status: 'failed',
      request,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    restoreWebGpu()
  }

  const backend = readBackend(renderer)
  useRendererReport.getState().setReport({
    status: 'ready',
    request,
    backend,
    fellBack: request !== 'force-webgl2' && backend === 'webgl2',
    webgpuExposed,
  })

  return renderer
}

/**
 * 생성을 직렬화한다.
 *
 * R3F는 마운트마다 렌더러 생성을 걸고 `StrictMode` 는 그 마운트를 두 번 돈다. 그런데
 * `simulate-no-webgpu` 는 `navigator.gpu` 라는 **전역**을 건드리므로, 두 생성이 겹치면
 * 한쪽의 복원이 다른 쪽의 감추기를 풀어버린다 — 폴백을 태우려던 실행이 WebGPU를 받고,
 * 복원이 어긋나 그 뒤로 WebGPU가 영영 사라지기도 한다.
 */
let queue: Promise<void> = Promise.resolve()

/**
 * WebGPU를 우선 시도하고 WebGL2로 폴백하는 렌더러를 만든다.
 *
 * 폴백 자체는 three.js가 `getFallback` 으로 처리하므로 여기서 구현하지 않는다.
 * 이 함수가 하는 일은 **어느 백엔드가 실제로 선택됐는지 확정해 보고**하는 것이다 —
 * 폴백이 조용히 일어나면 성능 문제의 원인을 나중에 짚을 수 없다.
 */
export function createRenderer(
  props: CanvasProps,
  request: RendererRequest,
): Promise<WebGPURenderer> {
  const run = queue.then(() => createOne(props, request))
  // 앞의 실패가 뒤를 막지 않도록 큐 자체는 언제나 성공으로 이어붙인다.
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

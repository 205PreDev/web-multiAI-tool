import { create } from 'zustand'

export type RendererBackend = 'webgpu' | 'webgl2'

/** 렌더러를 어떻게 고르라고 요청받았는가. URL 질의로 바꾼다. */
export type RendererRequest =
  /** 기본 — WebGPU를 시도하고 안 되면 three.js가 WebGL2로 폴백한다 */
  | 'auto'
  /** WebGPU 지원 여부와 무관하게 처음부터 WebGL2 백엔드를 쓴다 */
  | 'force-webgl2'
  /** navigator.gpu 를 잠시 감춰 폴백 경로 자체를 태운다. 검증용 */
  | 'simulate-no-webgpu'

interface RendererReady {
  status: 'ready'
  request: RendererRequest
  backend: RendererBackend
  /**
   * WebGPU를 요청했는데 WebGL2를 받았는가.
   *
   * `force-webgl2` 는 폴백이 아니다 — 처음부터 WebGL2 백엔드를 만든 것이라
   * three.js의 `getFallback` 경로를 지나지 않는다. 그 경로가 실제로 도는지는
   * `simulate-no-webgpu` 로 확인한다.
   */
  fellBack: boolean
  /** 브라우저가 WebGPU를 노출하는가. 어댑터 획득 실패는 여기서 알 수 없다. */
  webgpuExposed: boolean
}

interface RendererFailed {
  status: 'failed'
  request: RendererRequest
  message: string
}

/**
 * 실패를 상태로 들고 있는 이유 — WebGPU와 WebGL2가 **둘 다** 실패하면 화면은 그냥
 * 비어 있고, 이 모듈이 존재하는 이유인 "무엇이 돌고 있는가"를 아무도 답하지 못한다.
 */
export type RendererReport = RendererReady | RendererFailed

interface RendererReportStore {
  report: RendererReport | null
  setReport: (report: RendererReport) => void
}

export const useRendererReport = create<RendererReportStore>((set) => ({
  report: null,
  setReport: (report) => set({ report }),
}))

/** `?renderer=webgl2` / `?renderer=nogpu` 로 검증 경로를 고른다. */
export function readRendererRequest(search: string): RendererRequest {
  const value = new URLSearchParams(search).get('renderer')
  if (value === 'webgl2') return 'force-webgl2'
  if (value === 'nogpu') return 'simulate-no-webgpu'
  return 'auto'
}

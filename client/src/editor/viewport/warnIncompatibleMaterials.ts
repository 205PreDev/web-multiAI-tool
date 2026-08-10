import type { Object3D } from 'three'

/**
 * `WebGPURenderer` 는 NodeMaterial 파이프라인이라 raw `ShaderMaterial` 을 컴파일하지 못한다.
 * **백엔드가 WebGL2로 폴백해도 마찬가지다** — 폴백은 GPU API 를 바꿀 뿐 머티리얼 체계를
 * 바꾸지 않는다. 그때 three 가 내는 경고는 이렇다.
 *
 * ```
 * THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.
 * ```
 *
 * **이 경고는 어느 오브젝트가 범인인지 말해주지 않는다.** 그래서 해당 머티리얼을 쓰는
 * 컴포넌트는 화면에서 조용히 사라지고, 원인을 찾는 데 시간이 든다. 실제로 0단계에서
 * drei 의 `Grid` 가 이 방식으로 사라졌고 그리드가 없다는 사실 자체를 뒤늦게 알았다.
 *
 * 그래서 씬을 훑어 범인의 이름과 경로를 찍는다. 개발 빌드에서만 돈다.
 */
export function warnIncompatibleMaterials(scene: Object3D): void {
  if (!import.meta.env.DEV) return

  const offenders: string[] = []

  scene.traverse((object) => {
    const withMaterial = object as Object3D & { material?: unknown }
    if (!withMaterial.material) return

    const materials = Array.isArray(withMaterial.material)
      ? withMaterial.material
      : [withMaterial.material]

    for (const material of materials) {
      // ShaderMaterial 과 RawShaderMaterial 만 걸러낸다. NodeMaterial 계열은 isShaderMaterial 이 없다.
      const candidate = material as { isShaderMaterial?: boolean; isNodeMaterial?: boolean }
      if (candidate.isShaderMaterial && !candidate.isNodeMaterial) {
        offenders.push(describePath(object))
      }
    }
  })

  if (offenders.length === 0) return

  console.warn(
    `[viewport] WebGPU 렌더러가 컴파일하지 못하는 ShaderMaterial 이 ${offenders.length}개 있습니다. ` +
      `해당 오브젝트는 화면에 그려지지 않습니다:\n  ` +
      offenders.join('\n  '),
  )
}

function describePath(object: Object3D): string {
  const names: string[] = []
  let current: Object3D | null = object

  while (current) {
    names.unshift(current.name || current.type)
    current = current.parent
  }

  return names.join(' / ')
}

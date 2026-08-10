import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { warnIncompatibleMaterials } from './warnIncompatibleMaterials'

/**
 * 개발 빌드에서 씬을 한 번 훑어 렌더러와 맞지 않는 머티리얼을 찍는다.
 * 자식이 전부 마운트된 뒤에 돌아야 하므로 씬 트리의 마지막에 둔다.
 */
export function SceneDiagnostics() {
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    warnIncompatibleMaterials(scene)
  }, [scene])

  return null
}

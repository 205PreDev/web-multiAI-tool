import { useGizmoContext } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, type Vector3 } from 'three'
import { useTokenColors } from '../../ui/cssTokens'

/**
 * 화면 구석의 방향 표시. drei 의 `GizmoViewport` 를 대신한다.
 *
 * **원본을 쓰지 못하는 이유는 딱 한 줄이다** — `gl.capabilities.getMaxAnisotropy()` 를
 * 부르는데 `capabilities` 는 `WebGLRenderer` 에만 있어 WebGPU 에서는 `undefined` 이고,
 * 읽는 순간 앱 전체가 죽는다. 나머지 구조는 그대로 따랐다.
 *
 * `GizmoHelper` 자체는 Hud 와 카메라 동기화만 하고 렌더러 API 를 건드리지 않아 그대로 쓴다.
 */

const HEAD_CANVAS_SIZE = 64
const LABEL_FONT = '600 22px system-ui, sans-serif'

interface AxisSpec {
  label: string
  token: (typeof TOKENS)[number]
  position: [number, number, number]
  rotation: [number, number, number]
}

const TOKENS = ['--c-axis-x', '--c-axis-y', '--c-axis-z', '--c-axis-label'] as const

const AXES: AxisSpec[] = [
  { label: 'X', token: '--c-axis-x', position: [1, 0, 0], rotation: [0, 0, 0] },
  { label: 'Y', token: '--c-axis-y', position: [0, 1, 0], rotation: [0, 0, Math.PI / 2] },
  { label: 'Z', token: '--c-axis-z', position: [0, 0, 1], rotation: [0, -Math.PI / 2, 0] },
]

function createHeadTexture(color: string, label: string | null, labelColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = HEAD_CANVAS_SIZE
  canvas.height = HEAD_CANVAS_SIZE

  const context = canvas.getContext('2d')
  if (!context) return null

  const center = HEAD_CANVAS_SIZE / 2
  context.beginPath()
  context.arc(center, center, center / 2, 0, 2 * Math.PI)
  context.fillStyle = color
  context.fill()

  if (label) {
    context.font = LABEL_FONT
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = labelColor
    context.fillText(label, center, center + 1)
  }

  return new CanvasTexture(canvas)
}

function AxisShaft({ color, rotation }: { color: string; rotation: [number, number, number] }) {
  return (
    <group rotation={rotation}>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[0.8, 0.05, 0.05]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

function AxisHead({
  color,
  label,
  labelColor,
  position,
  onSelect,
}: {
  color: string
  label: string | null
  labelColor: string
  position: [number, number, number]
  onSelect: (position: Vector3) => void
}) {
  const [hovered, setHovered] = useState(false)
  const texture = useMemo(
    () => createHeadTexture(color, label, labelColor),
    [color, label, labelColor],
  )

  // CanvasTexture 는 GPU 자원을 잡으므로 색이나 라벨이 바뀌면 이전 것을 버린다.
  useEffect(() => () => texture?.dispose(), [texture])

  if (!texture) return null

  const scale = (label ? 1 : 0.75) * (hovered ? 1.2 : 1)

  return (
    <sprite
      position={position}
      scale={scale}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={(event) => {
        event.stopPropagation()
        setHovered(false)
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect(event.object.position)
      }}
    >
      {/* 원본과 다른 유일한 지점 — map-anisotropy 를 넘기지 않는다 */}
      <spriteMaterial map={texture} alphaTest={0.3} opacity={label ? 1 : 0.75} toneMapped={false} />
    </sprite>
  )
}

export function AxisGizmo() {
  const { tweenCamera } = useGizmoContext()
  const tokens = useTokenColors(TOKENS)
  const labelColor = tokens['--c-axis-label']

  return (
    <group scale={40}>
      {AXES.map((axis) => (
        <AxisShaft key={axis.label} color={tokens[axis.token]} rotation={axis.rotation} />
      ))}

      {AXES.map((axis) => (
        <AxisHead
          key={axis.label}
          color={tokens[axis.token]}
          label={axis.label}
          labelColor={labelColor}
          position={axis.position}
          onSelect={tweenCamera}
        />
      ))}

      {AXES.map((axis) => (
        <AxisHead
          key={`-${axis.label}`}
          color={tokens[axis.token]}
          label={null}
          labelColor={labelColor}
          position={[-axis.position[0], -axis.position[1], -axis.position[2]]}
          onSelect={tweenCamera}
        />
      ))}
    </group>
  )
}

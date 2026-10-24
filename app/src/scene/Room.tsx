import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'
import type { Box, PedestalLayout, RoomLayout } from '../palace/layout'
import { useStore } from '../store'
import { ShapeGeometry } from './Shapes'

export const FONT = '/fonts/SpaceGrotesk.ttf'
const WALL_COLOR = '#1B1638'
const FLOOR_COLOR = '#120F26'

export function Wall({ box, color = WALL_COLOR }: { box: Box; color?: string }) {
  const y = box.y ?? 0
  return (
    <mesh position={[box.x, y + box.h / 2, box.z]}>
      <boxGeometry args={[box.w, box.h, box.d]} />
      <meshStandardMaterial color={color} flatShading roughness={0.9} />
    </mesh>
  )
}

// Línea de neón sobre cada pared: le da a la sala su color.
function Trim({ box, color }: { box: Box; color: string }) {
  const y = (box.y ?? 0) + box.h
  return (
    <mesh position={[box.x, y + 0.04, box.z]}>
      <boxGeometry args={[box.w + 0.02, 0.08, box.d + 0.02]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

function Monument({ room }: { room: RoomLayout }) {
  const ref = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.25
      ref.current.rotation.x += dt * 0.1
    }
  })
  return (
    <group position={[room.x, 0, room.z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[1.1, 1.3, 0.6, 6]} />
        <meshStandardMaterial color={WALL_COLOR} flatShading />
      </mesh>
      <mesh ref={ref} position={[0, 2.2, 0]}>
        <ShapeGeometry shape={room.monument} size={1} />
        <meshStandardMaterial color={room.color} emissive={room.color} emissiveIntensity={0.6} flatShading />
      </mesh>
      <Billboard position={[0, 3.9, 0]}>
        <Text font={FONT} fontSize={0.55} color="#F4F1FF" anchorY="bottom" maxWidth={8} textAlign="center">
          {room.title}
        </Text>
      </Billboard>
    </group>
  )
}

function Pedestal({ p, color }: { p: PedestalLayout; color: string }) {
  const ref = useRef<Mesh>(null)
  const memorized = useStore((s) => !!s.memorized[p.concept.id])
  const focused = useStore((s) => s.focusedId === p.concept.id)
  const mode = useStore((s) => s.mode)
  const result = useStore((s) => s.exam[p.concept.id])
  useFrame((state, dt) => {
    if (!ref.current) return
    ref.current.rotation.y += dt * (focused ? 1.2 : 0.5)
    ref.current.position.y = 1.55 + Math.sin(state.clock.elapsedTime * 1.5 + p.x) * 0.06
  })

  const hidden = mode === 'exam' && !result
  const label = hidden ? '???' : p.concept.title
  const accent = mode === 'exam' && result ? (result === 'ok' ? '#7CFF6B' : '#FF6B5B') : memorized ? '#FFD36B' : color

  return (
    <group position={[p.x, 0, p.z]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.38, 0.48, 1, 6]} />
        <meshStandardMaterial color="#231D47" flatShading />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.05, 6]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh ref={ref} position={[0, 1.55, 0]}>
        <ShapeGeometry shape={p.shape} size={0.3} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={focused ? 1.2 : 0.45}
          flatShading
        />
      </mesh>
      <Billboard position={[0, 2.1, 0]}>
        <Text
          font={FONT}
          fontSize={0.2}
          maxWidth={2.2}
          textAlign="center"
          anchorY="bottom"
          color={focused ? '#FFFFFF' : '#CFC8F2'}
          outlineWidth={0.008}
          outlineColor="#0E0B1F"
        >
          {label}
        </Text>
      </Billboard>
    </group>
  )
}

export function Room({ room }: { room: RoomLayout }) {
  return (
    <group>
      <mesh position={[room.x, -0.05, room.z]}>
        <boxGeometry args={[room.w, 0.1, room.d]} />
        <meshStandardMaterial color={FLOOR_COLOR} flatShading />
      </mesh>
      {/* Alfombra hexagonal con el color de la sala */}
      <mesh position={[room.x, 0.01, room.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.min(room.w, room.d) * 0.22, 6]} />
        <meshStandardMaterial color={room.color} transparent opacity={0.18} />
      </mesh>
      {room.walls.map((w, i) => (
        <group key={i}>
          <Wall box={w} />
          <Trim box={w} color={room.color} />
        </group>
      ))}
      <pointLight position={[room.x, room.height - 0.8, room.z]} color={room.color} intensity={40} distance={room.w * 1.2} decay={1.6} />
      <Monument room={room} />
      {room.pedestals.map((p) => (
        <Pedestal key={p.concept.id} p={p} color={room.color} />
      ))}
    </group>
  )
}

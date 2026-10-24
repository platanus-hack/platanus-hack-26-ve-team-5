import { OrthographicCamera } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Box, PalaceLayout } from '../palace/layout'
import { ShapeGeometry } from './Shapes'

// Maqueta isométrica del palacio: paredes bajas para ver el plano completo.
const LOW = 1.2

function LowWall({ box, color }: { box: Box; color: string }) {
  if (box.y) return null
  return (
    <mesh position={[box.x, LOW / 2, box.z]}>
      <boxGeometry args={[box.w, LOW, box.d]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

function Model({ layout }: { layout: PalaceLayout }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.12
  })
  const { minX, maxX, minZ, maxZ } = layout.bounds
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const span = Math.max(maxX - minX, maxZ - minZ, 20)
  const scale = 22 / span

  return (
    <group ref={ref} scale={scale}>
      <group position={[-cx, 0, -cz]}>
        {layout.rooms.map((r) => (
          <group key={r.id}>
            <mesh position={[r.x, -0.1, r.z]}>
              <boxGeometry args={[r.w, 0.2, r.d]} />
              <meshStandardMaterial color="#1B1638" flatShading />
            </mesh>
            <mesh position={[r.x, 0.02, r.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[Math.min(r.w, r.d) * 0.3, 6]} />
              <meshBasicMaterial color={r.color} transparent opacity={0.25} />
            </mesh>
            {r.walls.map((w, i) => (
              <LowWall key={i} box={w} color="#2A2357" />
            ))}
            <mesh position={[r.x, 2, r.z]}>
              <ShapeGeometry shape={r.monument} size={1.1} />
              <meshStandardMaterial color={r.color} emissive={r.color} emissiveIntensity={0.7} flatShading />
            </mesh>
            {r.pedestals.map((p) => (
              <mesh key={p.concept.id} position={[p.x, 0.6, p.z]}>
                <cylinderGeometry args={[0.35, 0.45, 1.2, 6]} />
                <meshStandardMaterial color={r.color} emissive={r.color} emissiveIntensity={0.35} flatShading />
              </mesh>
            ))}
          </group>
        ))}
        {layout.corridors.map((c, i) => (
          <group key={i}>
            <mesh position={[c.floor.x, -0.1, c.floor.z]}>
              <boxGeometry args={[c.floor.w, 0.2, c.floor.d]} />
              <meshStandardMaterial color="#17132F" flatShading />
            </mesh>
            {c.walls.map((w, j) => (
              <LowWall key={j} box={w} color="#2A2357" />
            ))}
          </group>
        ))}
      </group>
    </group>
  )
}

export function Preview({ layout }: { layout: PalaceLayout | null }) {
  return (
    <Canvas dpr={[1, 2]}>
      <OrthographicCamera makeDefault position={[20, 20, 20]} zoom={18} near={-100} far={200} onUpdate={(c) => c.lookAt(0, 0, 0)} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 5]} intensity={1.4} color="#C9C2FF" />
      <directionalLight position={[-10, 5, -10]} intensity={0.5} color="#FF3DA5" />
      {layout && <Model layout={layout} />}
    </Canvas>
  )
}

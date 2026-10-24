import { Stars } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import type { PalaceLayout } from '../palace/layout'
import { Player } from './Player'
import { Room, Wall } from './Room'

export function World({ layout }: { layout: PalaceLayout }) {
  return (
    <Canvas camera={{ fov: 70, near: 0.1, far: 300 }} dpr={[1, 2]}>
      <color attach="background" args={['#07051A']} />
      <fog attach="fog" args={['#07051A', 12, 60]} />
      <hemisphereLight args={['#8B7CFF', '#0E0B1F', 0.6]} />
      <ambientLight intensity={0.25} />
      <Stars radius={120} depth={40} count={2500} factor={4} fade speed={0.5} />
      {layout.rooms.map((r) => (
        <Room key={r.id} room={r} />
      ))}
      {layout.corridors.map((c, i) => (
        <group key={i}>
          <mesh position={[c.floor.x, -0.05, c.floor.z]}>
            <boxGeometry args={[c.floor.w, 0.1, c.floor.d]} />
            <meshStandardMaterial color="#17132F" flatShading />
          </mesh>
          {c.walls.map((w, j) => (
            <Wall key={j} box={w} />
          ))}
        </group>
      ))}
      <Player layout={layout} />
    </Canvas>
  )
}

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { stepAnim } from '../memory/anim'
import { palaceKey, strengthOf } from '../memory/model'
import { PEDESTAL_TOP, SHARDS_PER_CONCEPT, detach, shardLayout } from '../memory/shards'
import { roomShown, roomStrength, shown, shownStrength, spinOf } from '../memory/shown'
import { nowMs, useMemory } from '../memory/store'
import { hash, type PalaceLayout, type RoomLayout } from '../palace/layout'
import { useStore } from '../store'
import type { RoomPalette, Theme } from '../theme'

// Desgaste visible del palacio. Todo se deduce de la fuerza del recuerdo ("mostrada", suavizada en el tiempo):
//  >= 0.85 yeso intacto · 0.6-0.85 grietas · 0.3-0.6 se inclina y suelta esquirlas · < 0.3 montón de escombros.
// Los fragmentos son una sola InstancedMesh para todo el palacio; las grietas son un parche de shader
// sobre el material del propio objeto, así que sirven para cualquier forma y no añaden draw calls.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const k = clamp01((v - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const SHARD_ACTIVE_BELOW = 0.73 // por encima de esto ningún fragmento se ha desprendido

export function DecayField({ layout, theme }: { layout: PalaceLayout; theme: Theme }) {
  const palace = useStore((s) => s.palace)
  const key = useMemo(() => (palace ? palaceKey(palace) : null), [palace])
  const items = useMemo(
    () =>
      layout.rooms.flatMap((r) =>
        r.pedestals.map((p) => ({ id: p.concept.id, roomId: r.id, x: p.x, z: p.z, shards: shardLayout(p.concept.id) })),
      ),
    [layout],
  )
  const count = items.length * SHARDS_PER_CONCEPT
  const mesh = useRef<THREE.InstancedMesh>(null)
  const last = useRef(new Map<string, number>())
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const reduced = useMemo(prefersReducedMotion, [])

  useLayoutEffect(() => {
    shown.clear()
    last.current.clear()
    const m = mesh.current
    if (!m) return
    dummy.scale.setScalar(0)
    dummy.updateMatrix()
    for (let i = 0; i < count; i++) m.setMatrixAt(i, dummy.matrix)
    m.instanceMatrix.needsUpdate = true
  }, [items, key, count, dummy])

  useFrame(() => {
    const m = mesh.current
    if (!m || !key) return
    const t = performance.now()
    const now = nowMs()
    const mem = useMemory.getState().palaces[key] ?? {}
    const acc = new Map<string, { sum: number; n: number }>()
    let dirty = false

    for (let k = 0; k < items.length; k++) {
      const it = items[k]
      const rec = mem[it.id]
      const a = stepAnim(shown.get(it.id), strengthOf(rec, now), t, reduced)
      shown.set(it.id, a)
      const s = a.cur
      if (rec) {
        const r = acc.get(it.roomId) ?? { sum: 0, n: 0 }
        r.sum += s
        r.n++
        acc.set(it.roomId, r)
      }
      const prev = last.current.get(it.id)
      last.current.set(it.id, s)
      if (s >= SHARD_ACTIVE_BELOW && (prev === undefined || prev >= SHARD_ACTIVE_BELOW)) continue
      dirty = true

      const spin = spinOf.get(it.id) ?? 0
      const cs = Math.cos(spin)
      const sn = Math.sin(spin)
      for (let i = 0; i < SHARDS_PER_CONCEPT; i++) {
        const sh = it.shards[i]
        const d = detach(sh.thr, s)
        const idx = k * SHARDS_PER_CONCEPT + i
        if (d <= 0.001) {
          dummy.scale.setScalar(0)
        } else {
          const e = d * d * (3 - 2 * d)
          const hx = sh.home[0] * cs + sh.home[2] * sn
          const hz = -sh.home[0] * sn + sh.home[2] * cs
          const arc = reduced ? 0 : Math.sin(Math.PI * e) * 0.3
          dummy.position.set(
            it.x + hx + (sh.rest[0] - hx) * e,
            sh.home[1] + (sh.rest[1] - sh.home[1]) * e + arc,
            it.z + hz + (sh.rest[2] - hz) * e,
          )
          dummy.rotation.set(sh.rot[0] * e, sh.rot[1] * e, sh.rot[2] * e)
          const grow = clamp01(d * 5)
          dummy.scale.set(sh.size[0] * grow, sh.size[1] * grow, sh.size[2] * grow)
        }
        dummy.updateMatrix()
        m.setMatrixAt(idx, dummy.matrix)
      }
    }
    if (dirty) m.instanceMatrix.needsUpdate = true
    for (const [roomId, r] of acc) roomShown.set(roomId, r.sum / r.n)
    for (const roomId of roomShown.keys()) if (!acc.has(roomId)) roomShown.set(roomId, 1)
  })

  if (!count) return null
  return (
    <instancedMesh key={count} ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} castShadow receiveShadow>
      <tetrahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={theme.scene.object.color} roughness={theme.scene.object.roughness} flatShading />
    </instancedMesh>
  )
}

// ---------- Grietas: parche de shader sobre el material del objeto ----------

const CRACK_GLSL = /* glsl */ `
varying vec3 vCrackPos;
uniform float uCrack;
float crackMask(vec3 p) {
  float a = sin(p.x * 17.0 + 1.7 * sin(p.y * 11.0 + p.z * 9.0));
  float b = sin(p.y * 15.0 + 1.7 * sin(p.z * 13.0 + p.x * 7.0));
  float n = a * b;
  float thin = 0.012 + 0.05 * uCrack;
  float line = 1.0 - smoothstep(thin * 0.5, thin + fwidth(n), abs(n));
  float g = 0.5 + 0.5 * sin(p.x * 5.0 + p.y * 7.0 + p.z * 6.0);
  float gate = smoothstep(1.0 - uCrack * 1.1, 1.0 - uCrack * 1.1 + 0.12, g);
  return line * gate * step(0.001, uCrack);
}
`

function patchMaterial(mat: THREE.Material, uniform: { value: number }) {
  const m = mat as THREE.MeshStandardMaterial
  if (!m.isMeshStandardMaterial || m.userData.crackPatched) return
  m.userData.crackPatched = true
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCrack = uniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrackPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrackPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CRACK_GLSL}`)
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.08, 0.07), crackMask(vCrackPos) * 0.9);',
      )
  }
  m.customProgramCacheKey = () => 'mus3o-crack'
  m.needsUpdate = true
}

/**
 * Envuelve el objeto de un pedestal: aplica grietas, inclinación y derrumbe según la fuerza mostrada.
 * Los hijos usan coordenadas del pedestal (el grupo interno compensa la altura de la tapa).
 */
export function DecayWrap({ id, children }: { id: string; children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const crack = useMemo(() => ({ value: 0 }), [])
  const phase = useMemo(() => ((hash(id) % 628) / 100), [id])

  useLayoutEffect(() => {
    group.current?.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!mat) return
      for (const x of Array.isArray(mat) ? mat : [mat]) patchMaterial(x, crack)
    })
  })

  useFrame(() => {
    const g = group.current
    if (!g) return
    const s = shownStrength(id)
    crack.value = clamp01((0.9 - s) / 0.4)
    const lean = smooth(0.62, 0.3, s) * 0.3 + smooth(0.3, 0.1, s) * 0.2
    g.rotation.set(Math.cos(phase) * lean, 0, Math.sin(phase) * lean)
    const collapse = smooth(0.3, 0.08, s)
    g.scale.setScalar(Math.max(0.0001, 1 - collapse))
    g.visible = collapse < 0.99
  })

  return (
    <group ref={group} position={[0, PEDESTAL_TOP, 0]}>
      <group position={[0, -PEDESTAL_TOP, 0]}>{children}</group>
    </group>
  )
}

// ---------- Sala: el pigmento se apaga y el fresco se desprende ----------

const PALE_FLOOR = new THREE.Color('#B9B0A2')
const PALE_PLASTER = '#DCD4C5'
const FLAKES = 16

/** Suelo de la sala: pierde el pigmento hacia yeso pálido según la memoria de la sala. */
export function FadingFloor({ room, palette }: { room: RoomLayout; palette: RoomPalette }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const base = useMemo(() => new THREE.Color(palette.floor), [palette.floor])
  useFrame(() => {
    const m = mat.current
    if (!m) return
    const fade = clamp01((1 - roomStrength(room.id)) / 0.7) * 0.75
    m.color.copy(base).lerp(PALE_FLOOR, fade)
  })
  return (
    <mesh position={[room.x, -0.05, room.z]} receiveShadow>
      <boxGeometry args={[room.w, 0.1, room.d]} />
      <meshStandardMaterial ref={mat} color={palette.floor} flatShading roughness={1} />
    </mesh>
  )
}

let flakeGeometry: THREE.ShapeGeometry | null = null
function getFlakeGeometry() {
  if (flakeGeometry) return flakeGeometry
  const shape = new THREE.Shape()
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 0.5 * (0.62 + 0.38 * Math.abs(Math.sin(i * 12.9898 + 4.1)))
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  flakeGeometry = new THREE.ShapeGeometry(shape)
  return flakeGeometry
}

type Flake = { x: number; y: number; z: number; rotY: number; w: number; h: number; rot: number }

function flakeLayout(room: RoomLayout): Flake[] {
  const walls = room.walls.filter((w) => w.h > 2 && Math.max(w.w, w.d) > 1.2)
  if (!walls.length) return []
  let seed = hash(room.id) || 1
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const total = walls.reduce((s, w) => s + Math.max(w.w, w.d), 0)
  const out: Flake[] = []
  for (let i = 0; i < FLAKES; i++) {
    let pick = rnd() * total
    let wall = walls[0]
    for (const w of walls) {
      pick -= Math.max(w.w, w.d)
      if (pick <= 0) {
        wall = w
        break
      }
    }
    const horizontal = wall.w >= wall.d
    const len = horizontal ? wall.w : wall.d
    const u = (rnd() - 0.5) * (len - 0.8)
    const y = 0.9 + rnd() * Math.min(wall.h - 1.6, 3)
    const w = 0.5 + rnd() * 0.9
    const h = 0.4 + rnd() * 0.7
    const rot = rnd() * Math.PI
    if (horizontal) {
      const sign = room.z > wall.z ? 1 : -1
      out.push({ x: wall.x + u, y, z: wall.z + sign * (wall.d / 2 + 0.03), rotY: sign > 0 ? 0 : Math.PI, w, h, rot })
    } else {
      const sign = room.x > wall.x ? 1 : -1
      out.push({ x: wall.x + sign * (wall.w / 2 + 0.03), y, z: wall.z + u, rotY: sign > 0 ? Math.PI / 2 : -Math.PI / 2, w, h, rot })
    }
  }
  return out
}

/** Parches de yeso pálido sobre el muro, como si el fresco se hubiera caído. Un solo draw call por sala. */
export function WallFlakes({ room }: { room: RoomLayout }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const flakes = useMemo(() => flakeLayout(room), [room])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const lastFade = useRef(-1)
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const fade = clamp01((0.92 - roomStrength(room.id)) / 0.65)
    if (Math.abs(fade - lastFade.current) < 0.002) return
    lastFade.current = fade
    flakes.forEach((f, i) => {
      const grow = clamp01((fade * 1.1 - i / flakes.length) * 4)
      dummy.position.set(f.x, f.y, f.z)
      dummy.rotation.set(0, f.rotY, 0)
      dummy.rotateZ(f.rot)
      dummy.scale.set(f.w * grow, f.h * grow, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  if (!flakes.length) return null
  return (
    <instancedMesh ref={mesh} args={[getFlakeGeometry(), undefined, flakes.length]} frustumCulled={false} receiveShadow>
      <meshStandardMaterial color={PALE_PLASTER} roughness={1} flatShading polygonOffset polygonOffsetFactor={-2} />
    </instancedMesh>
  )
}

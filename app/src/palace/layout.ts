import type { Concept, Palace } from './schema'

// Todo en metros, plano XZ. Y es la altura.
export type Box = { x: number; z: number; w: number; d: number; h: number; y?: number }
export type Side = 'n' | 's' | 'e' | 'w'
export type Monument = 'icosahedron' | 'torusKnot' | 'octahedron' | 'dodecahedron' | 'cone' | 'torus'
export type Shape = 'icosahedron' | 'octahedron' | 'dodecahedron' | 'tetrahedron' | 'torus' | 'cone' | 'box' | 'sphere'

export type PedestalLayout = { concept: Concept; x: number; z: number; shape: Shape; facing: number }

export type RoomLayout = {
  id: string
  index: number
  title: string
  color: string
  x: number
  z: number
  w: number
  d: number
  height: number
  monument: Monument
  doors: Side[]
  walls: Box[]
  pedestals: PedestalLayout[]
}

export type CorridorLayout = { floor: Box; walls: Box[] }

export type PalaceLayout = {
  rooms: RoomLayout[]
  corridors: CorridorLayout[]
  colliders: Box[]
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  spawn: { x: number; z: number; yaw: number }
}

export const ROOM_COLORS = ['#2EE6D6', '#FF3DA5', '#FFB547', '#8B7CFF', '#7CFF6B', '#FF6B5B', '#4DB8FF', '#F2F26B']
const MONUMENTS: Monument[] = ['icosahedron', 'torusKnot', 'octahedron', 'dodecahedron', 'cone', 'torus']
const SHAPES: Shape[] = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron', 'torus', 'cone', 'box', 'sphere']

const WALL_T = 0.4
const DOOR_W = 2.8
const CORRIDOR_LEN = 6
const PEDESTAL_SPACING = 2.6
const PEDESTAL_SIZE = 0.9

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Recorrido en serpiente: salas consecutivas siempre son vecinas en la grilla.
function cellOf(i: number, cols: number) {
  const row = Math.floor(i / cols)
  const col = row % 2 === 0 ? i % cols : cols - 1 - (i % cols)
  return { row, col }
}

function sideToward(a: { row: number; col: number }, b: { row: number; col: number }): Side {
  if (b.col > a.col) return 'e'
  if (b.col < a.col) return 'w'
  return b.row > a.row ? 's' : 'n'
}

const opposite: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' }

// Divide cada pared en dos tramos cuando tiene puerta.
function roomWalls(x: number, z: number, w: number, d: number, h: number, doors: Side[]): Box[] {
  const walls: Box[] = []
  const add = (side: Side) => {
    const horizontal = side === 'n' || side === 's'
    const len = horizontal ? w : d
    const cx = side === 'e' ? x + w / 2 : side === 'w' ? x - w / 2 : x
    const cz = side === 's' ? z + d / 2 : side === 'n' ? z - d / 2 : z
    const seg = (offset: number, l: number) =>
      horizontal
        ? { x: cx + offset, z: cz, w: l, d: WALL_T, h }
        : { x: cx, z: cz + offset, w: WALL_T, d: l, h }
    if (!doors.includes(side)) {
      walls.push(seg(0, len + WALL_T))
      return
    }
    const part = (len + WALL_T - DOOR_W) / 2
    walls.push(seg(-(DOOR_W / 2 + part / 2), part), seg(DOOR_W / 2 + part / 2, part))
    // Dintel sobre la puerta.
    walls.push({ ...seg(0, DOOR_W), h: h - 3, y: 3 })
  }
  ;(['n', 's', 'e', 'w'] as Side[]).forEach(add)
  return walls
}

export function buildLayout(palace: Palace): PalaceLayout {
  const n = palace.rooms.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  const cells = palace.rooms.map((_, i) => cellOf(i, cols))

  // Tamaño de cada sala según cuántos conceptos tiene (anillo de pedestales).
  const sizes = palace.rooms.map((room, i) => {
    const count = Math.max(room.concepts.length, 1)
    const radius = Math.max(3.2, (count * PEDESTAL_SPACING) / (2 * Math.PI))
    const half = radius + 3
    const aspect = i % 3 === 1 ? 1.35 : 1 // algunas salas son alargadas
    return { radius, w: half * 2 * aspect, d: half * 2, aspect }
  })
  const cell = Math.max(...sizes.map((s) => Math.max(s.w, s.d))) + CORRIDOR_LEN

  const doorsOf: Side[][] = palace.rooms.map(() => [])
  for (let i = 0; i < n - 1; i++) {
    const s = sideToward(cells[i], cells[i + 1])
    doorsOf[i].push(s)
    doorsOf[i + 1].push(opposite[s])
  }

  const rooms: RoomLayout[] = palace.rooms.map((room, i) => {
    const { row, col } = cells[i]
    const x = col * cell
    const z = row * cell
    const { w, d, radius, aspect } = sizes[i]
    const height = 4.5 + (hash(room.title) % 3) * 1.2
    const count = room.concepts.length
    const offset = Math.PI / Math.max(count, 1) + Math.PI / 4
    const pedestals = room.concepts.map((concept, k) => {
      const a = (k / Math.max(count, 1)) * Math.PI * 2 + offset
      const px = x + Math.cos(a) * radius * aspect
      const pz = z + Math.sin(a) * radius
      return {
        concept,
        x: px,
        z: pz,
        shape: SHAPES[hash(concept.title) % SHAPES.length],
        facing: Math.atan2(px - x, pz - z), // mira hacia afuera, al visitante
      }
    })
    return {
      id: room.id,
      index: i,
      title: room.title,
      color: ROOM_COLORS[i % ROOM_COLORS.length],
      x,
      z,
      w,
      d,
      height,
      monument: MONUMENTS[i % MONUMENTS.length],
      doors: doorsOf[i],
      walls: roomWalls(x, z, w, d, height, doorsOf[i]),
      pedestals,
    }
  })

  const corridors: CorridorLayout[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = rooms[i]
    const b = rooms[i + 1]
    const side = a.doors.find((s) => s === sideToward(cells[i], cells[i + 1]))!
    const h = 3.6
    if (side === 'e' || side === 'w') {
      const x1 = side === 'e' ? a.x + a.w / 2 : b.x + b.w / 2
      const x2 = side === 'e' ? b.x - b.w / 2 : a.x - a.w / 2
      const len = x2 - x1
      const cx = (x1 + x2) / 2
      corridors.push({
        floor: { x: cx, z: a.z, w: len, d: DOOR_W, h: 0 },
        walls: [
          { x: cx, z: a.z - DOOR_W / 2 - WALL_T / 2, w: len, d: WALL_T, h },
          { x: cx, z: a.z + DOOR_W / 2 + WALL_T / 2, w: len, d: WALL_T, h },
        ],
      })
    } else {
      const z1 = side === 's' ? a.z + a.d / 2 : b.z + b.d / 2
      const z2 = side === 's' ? b.z - b.d / 2 : a.z - a.d / 2
      const len = z2 - z1
      const cz = (z1 + z2) / 2
      corridors.push({
        floor: { x: a.x, z: cz, w: DOOR_W, d: len, h: 0 },
        walls: [
          { x: a.x - DOOR_W / 2 - WALL_T / 2, z: cz, w: WALL_T, d: len, h },
          { x: a.x + DOOR_W / 2 + WALL_T / 2, z: cz, w: WALL_T, d: len, h },
        ],
      })
    }
  }

  const colliders: Box[] = [
    ...rooms.flatMap((r) => r.walls.filter((w) => !w.y)),
    ...corridors.flatMap((c) => c.walls),
    ...rooms.flatMap((r) => r.pedestals.map((p) => ({ x: p.x, z: p.z, w: PEDESTAL_SIZE, d: PEDESTAL_SIZE, h: 1 }))),
    ...rooms.map((r) => ({ x: r.x, z: r.z, w: 1.6, d: 1.6, h: 2 })),
  ]

  const xs = rooms.flatMap((r) => [r.x - r.w / 2, r.x + r.w / 2])
  const zs = rooms.flatMap((r) => [r.z - r.d / 2, r.z + r.d / 2])
  const first = rooms[0]
  // Aparece en una esquina sin puerta, mirando al monumento: lejos del anillo de pedestales.
  const sx = first.x - first.w / 2 + 1.5
  const sz = first.z - first.d / 2 + 1.5
  const spawn = { x: sx, z: sz, yaw: Math.atan2(-(first.x - sx), -(first.z - sz)) }

  return {
    rooms,
    corridors,
    colliders,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
    spawn,
  }
}

export function roomAt(layout: PalaceLayout, x: number, z: number): RoomLayout | null {
  return (
    layout.rooms.find((r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) ?? null
  )
}

const PLAYER_R = 0.35

function hits(x: number, z: number, b: Box) {
  return Math.abs(x - b.x) < b.w / 2 + PLAYER_R && Math.abs(z - b.z) < b.d / 2 + PLAYER_R
}

// Mueve por ejes separados para poder deslizarse contra las paredes.
export function moveWithCollisions(colliders: Box[], x: number, z: number, dx: number, dz: number) {
  let nx = x + dx
  if (colliders.some((b) => hits(nx, z, b))) nx = x
  let nz = z + dz
  if (colliders.some((b) => hits(nx, nz, b))) nz = z
  return { x: nx, z: nz }
}

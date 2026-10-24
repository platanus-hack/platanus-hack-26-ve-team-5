import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Museum, Piece } from '@mus3o/shared'
import { useMemory } from '../memory/store'
import { useStore } from '../store'
import { canOpenDoor, earnedRoomKeys, remainingToMemorize } from './keys'
import { buildLayout } from './layout'

// La store persiste en localStorage: en Node se le da uno en memoria (vi.hoisted corre antes de los imports).
vi.hoisted(() => {
  const data = new Map<string, string>()
  const localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
  Object.assign(globalThis, { window: { localStorage } })
})

const piece = (id: string, extra: Partial<Piece> = {}): Piece => ({ id, title: id, text: '', fact: '', ...extra })
const keyPiece = (id: string) => piece(id, { model: { type: 'catalog', id: 'dungeon_key' } })

const museum: Museum = {
  title: 'Test',
  rooms: [
    { id: 'a', name: 'A', description: '', pieces: [piece('a1'), piece('a2'), keyPiece('a-key')] },
    { id: 'b', name: 'B', description: '', pieces: [piece('b1')] },
    { id: 'c', name: 'C', description: '', pieces: [] },
  ],
}

describe('room keys', () => {
  it('counts every piece that is still missing, dungeon pieces included', () => {
    expect(remainingToMemorize(museum.rooms[0], { a1: true }, {})).toBe(2)
    expect(remainingToMemorize(museum.rooms[0], { a1: true, a2: true }, {})).toBe(1)
    expect(remainingToMemorize(museum.rooms[0], { a1: true, a2: true, 'a-key': true }, {})).toBe(0)
  })

  it('does not give a free key to a room that only has dungeon pieces', () => {
    const dungeon: Museum = { title: 'D', rooms: [{ id: 'd', name: 'D', description: '', pieces: [keyPiece('k')] }] }
    expect(earnedRoomKeys(dungeon, {}, {})).toEqual({})
  })

  it('earns a room key when every standard piece is memorized', () => {
    expect(earnedRoomKeys(museum, { a1: true, a2: true }, {})).toEqual({ c: true })
    expect(earnedRoomKeys(museum, { a1: true, a2: true, 'a-key': true }, {})).toEqual({ a: true, c: true })
  })

  it('counts correct exam answers as memorized, but not wrong ones', () => {
    expect(earnedRoomKeys(museum, {}, { b1: 'ok' })).toEqual({ b: true, c: true })
    expect(earnedRoomKeys(museum, {}, { b1: 'fail' })).toEqual({ c: true })
  })

  it('opens a door with the key of the room it leaves or with the dungeon key', () => {
    const door = buildLayout(museum).doors[0]
    expect(door.fromRoomId).toBe('a')
    expect(canOpenDoor(door, false, {})).toBe(false)
    expect(canOpenDoor(door, false, { b: true })).toBe(false)
    expect(canOpenDoor(door, false, { a: true })).toBe(true)
    expect(canOpenDoor(door, true, {})).toBe(true)
  })

  it('places every door at the corridor end that touches the room it leaves', () => {
    const rooms = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, description: '', pieces: [piece(`p${i}`)] }))
    const hub = { start: 'r0', edges: rooms.slice(1).map((r) => ({ from: 'r0', to: r.id, kind: 'related' as const })) }
    for (const m of [{ title: 'snake', rooms }, { title: 'hub', rooms, graph: hub }]) {
      const layout = buildLayout(m)
      for (const door of layout.doors) {
        const { floor } = layout.corridors[door.corridorIndex]
        const horizontal = floor.w > floor.d
        const ends = horizontal
          ? [floor.x - floor.w / 2, floor.x + floor.w / 2].map((x) => ({ x, z: floor.z }))
          : [floor.z - floor.d / 2, floor.z + floor.d / 2].map((z) => ({ x: floor.x, z }))
        const room = layout.rooms.find((r) => r.id === door.fromRoomId)!
        const end = ends.find((e) => Math.hypot(e.x - door.x, e.z - door.z) < 1e-9)
        expect(end).toBeDefined()
        // Ese extremo está sobre la pared de la sala de salida.
        expect(Math.abs(end!.x - room.x) <= room.w / 2 + 1e-9 && Math.abs(end!.z - room.z) <= room.d / 2 + 1e-9).toBe(true)
      }
    }
  })

  it('records the room each door leaves from', () => {
    const doors = buildLayout(museum).doors
    expect(doors.map((d) => d.fromRoomId)).toEqual(['a', 'b'])
  })
})

describe('store', () => {
  beforeEach(() => {
    // La memoria persiste entre casos: se limpia para que cada test empiece sin repasos previos.
    useMemory.setState({ palaces: {}, timeOffsetDays: 0 })
    useStore.getState().enterPalace(museum)
  })

  it('gives the room key after memorizing its last piece and announces it', () => {
    const s = useStore.getState()
    s.toggleMemorized('a1')
    s.toggleMemorized('a2')
    expect(useStore.getState().roomKeys.a).toBeUndefined()
    s.toggleMemorized('a-key')
    expect(useStore.getState().roomKeys.a).toBe(true)
    expect(useStore.getState().lastKeyRoomId).toBe('a')
  })

  it('keeps the key when a piece is unmarked later', () => {
    const s = useStore.getState()
    s.toggleMemorized('a1')
    s.toggleMemorized('a2')
    s.toggleMemorized('a-key')
    s.toggleMemorized('a2')
    expect(useStore.getState().memorized.a2).toBeUndefined()
    expect(useStore.getState().roomKeys.a).toBe(true)
  })

  it('gives the room key after answering its last piece correctly in the exam', () => {
    useStore.getState().setMode('exam')
    useStore.getState().recordExam('b1', 'ok')
    expect(useStore.getState().roomKeys.b).toBe(true)
  })

  it('starts a new palace without keys except for rooms with nothing to memorize', () => {
    expect(useStore.getState().roomKeys).toEqual({ c: true })
    expect(useStore.getState().lastKeyRoomId).toBeNull()
  })
})

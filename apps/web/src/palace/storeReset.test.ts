import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Museum, Piece } from '@mus3o/shared'
import { dioramaRequest, useDioramaStore } from '../diorama/dioramaStore'
import { useMemory } from '../memory/store'
import { useStore } from '../store'

vi.hoisted(() => {
  const data = new Map<string, string>()
  const localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
  Object.assign(globalThis, { window: { localStorage } })
})

const piece = (id: string): Piece => ({ id, title: id, text: '', fact: '' })
const museum: Museum = {
  title: 'Test',
  rooms: [
    { id: 'a', name: 'A', description: '', pieces: [piece('a1')] },
    { id: 'b', name: 'B', description: '', pieces: [piece('b1')] },
  ],
}
const other: Museum = { title: 'Other', rooms: [{ id: 'z', name: 'Z', description: '', pieces: [piece('z1')] }] }

function dirty() {
  useStore.setState({
    mode: 'exam',
    reviewIds: ['a1'],
    currentRoomId: 'b',
    locked: true,
    openId: 'a1',
    focusedId: 'a1',
    focusedDoorId: 'd1',
    hasKey: true,
    arisMessage: 'hola',
    arisPromptOpen: true,
    exam: { a1: 'ok' },
  })
  useDioramaStore.setState({ phase: 'inside', activeId: 'p1', hintId: 'p1', nearReturn: true })
  dioramaRequest.enter = 'p1'
  dioramaRequest.leave = true
}

describe('palace transitions', () => {
  beforeEach(() => {
    useMemory.setState({ palaces: {}, timeOffsetDays: 0 })
    useStore.getState().enterPalace(museum)
  })

  it('enterPalace resets transient state but keeps preferences', () => {
    useStore.setState({ freeExplore: false })
    dirty()
    useStore.getState().enterPalace(other)
    const s = useStore.getState()
    expect(s.mode).toBe('explore')
    expect(s.reviewIds).toBeNull()
    expect(s.currentRoomId).toBeNull()
    expect(s.locked).toBe(false)
    expect(s.openId).toBeNull()
    expect(s.focusedId).toBeNull()
    expect(s.focusedDoorId).toBeNull()
    expect(s.hasKey).toBe(false)
    expect(s.arisMessage).toBeNull()
    expect(s.arisPromptOpen).toBe(false)
    expect(s.exam).toEqual({})
    expect(s.freeExplore).toBe(false)
    expect(useDioramaStore.getState().phase).toBe('room')
    expect(useDioramaStore.getState().hintId).toBeNull()
    expect(dioramaRequest.enter).toBeNull()
    expect(dioramaRequest.leave).toBe(false)
  })

  it('exitToLanding clears mode, review, Aris and lock but keeps progress', () => {
    useStore.getState().toggleMemorized('a1')
    dirty()
    useStore.getState().exitToLanding()
    const s = useStore.getState()
    expect(s.screen).toBe('landing')
    expect(s.mode).toBe('explore')
    expect(s.reviewIds).toBeNull()
    expect(s.arisMessage).toBeNull()
    expect(s.arisPromptOpen).toBe(false)
    expect(s.locked).toBe(false)
    expect(s.openId).toBeNull()
    expect(s.memorized.a1).toBe(true)
    expect(s.palace).not.toBeNull()
    expect(useDioramaStore.getState().phase).toBe('room')
  })
})

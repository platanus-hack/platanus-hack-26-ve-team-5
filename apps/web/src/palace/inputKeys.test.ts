import { describe, expect, it } from 'vitest'
import { allowedKeys, findDoor } from './inputKeys'
import type { PalaceLayout } from './layout'

const base = { introActive: false, dioramaPhase: 'room' as const, hasConcept: false }

describe('allowedKeys', () => {
  it('en el palacio permite E, M, T y N', () => {
    const k = allowedKeys(base)
    for (const c of ['KeyE', 'KeyM', 'KeyT', 'KeyN']) expect(k.has(c)).toBe(true)
    expect(k.has('KeyQ')).toBe(false)
  })
  it('dentro del cuadro no hay T; M solo con un concepto enlazado', () => {
    const none = allowedKeys({ ...base, dioramaPhase: 'inside' })
    expect(none.has('KeyT')).toBe(false)
    expect(none.has('KeyM')).toBe(false)
    expect(none.has('KeyE') && none.has('KeyQ') && none.has('KeyN')).toBe(true)
    expect(allowedKeys({ ...base, dioramaPhase: 'inside', hasConcept: true }).has('KeyM')).toBe(true)
  })
  it('en transiciones solo N; durante la intro nada', () => {
    for (const p of ['entering', 'leaving'] as const) {
      expect([...allowedKeys({ ...base, dioramaPhase: p })]).toEqual(['KeyN'])
    }
    expect(allowedKeys({ ...base, introActive: true }).size).toBe(0)
  })
})

describe('findDoor', () => {
  const layout = { doors: [{ id: 'd1' }, { id: 'd2' }] } as unknown as PalaceLayout
  it('usa el layout que se le pasa', () => {
    expect(findDoor(layout, 'd2')?.id).toBe('d2')
    expect(findDoor(layout, 'zz')).toBeUndefined()
    expect(findDoor(layout, null)).toBeUndefined()
    expect(findDoor({ doors: [] } as unknown as PalaceLayout, 'd1')).toBeUndefined()
  })
})

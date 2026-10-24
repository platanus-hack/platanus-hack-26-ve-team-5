import { describe, expect, it } from 'vitest'
import {
  DAY_MS, applyExam, dueIds, isDue, levelFromStrength, markLearned, palaceKey, roomMemory, sanitizePalaces, strengthOf,
} from './model'

const T0 = 1_700_000_000_000

describe('curva de olvido', () => {
  it('sin registro es 1 y no está pendiente', () => {
    expect(strengthOf(undefined, T0)).toBe(1)
    expect(isDue(undefined, T0 + 100 * DAY_MS)).toBe(false)
  })
  it('decae exponencialmente con la estabilidad', () => {
    const rec = markLearned(undefined, T0)
    expect(strengthOf(rec, T0)).toBe(1)
    expect(strengthOf(rec, T0 + DAY_MS)).toBeCloseTo(Math.exp(-1), 6)
    expect(strengthOf(rec, T0 + 3 * DAY_MS)).toBeCloseTo(Math.exp(-3), 6)
  })
  it('un reloj atrasado no sube la fuerza por encima de 1', () => {
    expect(strengthOf(markLearned(undefined, T0), T0 - DAY_MS)).toBe(1)
  })
  it('niveles visuales', () => {
    expect(levelFromStrength(0.9)).toBe('intact')
    expect(levelFromStrength(0.7)).toBe('cracked')
    expect(levelFromStrength(0.4)).toBe('broken')
    expect(levelFromStrength(0.1)).toBe('forgotten')
  })
})

describe('repasos', () => {
  it('marcar memorizado crea estabilidad de 1 día', () => {
    const r = markLearned(undefined, T0)
    expect(r).toMatchObject({ stability: 1, reviews: 1, lapses: 0, lastReview: T0 })
  })
  it('acierto multiplica por 2.5 y respeta el tope', () => {
    let r = markLearned(undefined, T0)
    r = applyExam(r, true, T0)
    expect(r.stability).toBeCloseTo(2.5)
    for (let i = 0; i < 20; i++) r = applyExam(r, true, T0)
    expect(r.stability).toBe(365)
  })
  it('fallo hunde la estabilidad y cuenta la caída', () => {
    const r = applyExam(markLearned(undefined, T0), false, T0 + DAY_MS)
    expect(r.stability).toBe(0.3)
    expect(r.lapses).toBe(1)
    expect(r.reviews).toBe(2)
  })
  it('el historial se limita a 20', () => {
    let r = markLearned(undefined, T0)
    for (let i = 0; i < 40; i++) r = applyExam(r, i % 2 === 0, T0 + i)
    expect(r.history).toHaveLength(20)
  })
  it('pendiente cuando la fuerza baja de 0.7', () => {
    const r = markLearned(undefined, T0)
    // exp(-d) < 0.7  =>  d > 0.357 días
    expect(isDue(r, T0 + 0.3 * DAY_MS)).toBe(false)
    expect(isDue(r, T0 + 0.4 * DAY_MS)).toBe(true)
  })
})

describe('derivados', () => {
  const mem = { a: markLearned(undefined, T0), b: applyExam(markLearned(undefined, T0), true, T0) }
  it('cuenta pendientes y promedia por sala', () => {
    const now = T0 + 0.5 * DAY_MS
    expect(dueIds(mem, ['a', 'b', 'c'], now)).toEqual(['a'])
    const room = roomMemory(mem, ['a', 'b', 'c'], now)
    expect(room.learned).toBe(2)
    expect(room.due).toBe(1)
    expect(room.strength).toBeCloseTo((Math.exp(-0.5) + Math.exp(-0.5 / 2.5)) / 2)
  })
  it('sala sin aprender vale 1', () => {
    expect(roomMemory({}, ['x'], T0).strength).toBe(1)
  })
})

describe('desfase de tiempo', () => {
  it('el tiempo simulado envejece el recuerdo', () => {
    const r = markLearned(undefined, T0)
    const offsetDays = 7
    expect(strengthOf(r, T0 + offsetDays * DAY_MS)).toBeLessThan(0.01)
    expect(isDue(r, T0 + offsetDays * DAY_MS)).toBe(true)
  })
})

describe('almacenamiento corrupto', () => {
  it('descarta basura sin lanzar', () => {
    for (const bad of [null, undefined, 42, 'x', [], { k: 5 }, { k: { a: null } }, { k: { a: { stability: 'x' } } }]) {
      expect(() => sanitizePalaces(bad)).not.toThrow()
    }
    expect(sanitizePalaces({ k: { a: { stability: -1, lastReview: 1 } } })).toEqual({ k: {} })
  })
  it('conserva registros válidos y limpia el historial', () => {
    const out = sanitizePalaces({ k: { a: { stability: 2, lastReview: T0, reviews: 3.7, lapses: -2, history: [{ t: 1, ok: true }, { t: 'x' }, null] } } })
    expect(out.k.a).toEqual({ stability: 2, lastReview: T0, reviews: 3, lapses: 0, history: [{ t: 1, ok: true }] })
  })
})

describe('palaceKey', () => {
  const m = (title: string) => ({ rooms: [{ id: 'r1', name: 'Sala', pieces: [{ id: 'p1', title }] }] })
  it('es estable y cambia con el contenido', () => {
    expect(palaceKey(m('A'))).toBe(palaceKey(m('A')))
    expect(palaceKey(m('A'))).not.toBe(palaceKey(m('B')))
  })
})

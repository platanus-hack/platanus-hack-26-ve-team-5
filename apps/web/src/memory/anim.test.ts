import { describe, expect, it } from 'vitest'
import { DECAY_MS, REDUCED_MS, RESTORE_MS, stepAnim } from './anim'

describe('stepAnim', () => {
  it('arranca en el valor real sin animar', () => {
    expect(stepAnim(undefined, 0.8, 0, false).cur).toBe(0.8)
  })
  it('el salto de tiempo anima la caída en 1.5 s', () => {
    let a = stepAnim(undefined, 1, 0, false)
    a = stepAnim(a, 0.2, 100, false)
    expect(a.dur).toBe(DECAY_MS)
    expect(a.cur).toBeGreaterThan(0.2)
    expect(a.cur).toBeLessThanOrEqual(1)
    expect(stepAnim(a, 0.2, 100 + DECAY_MS, false).cur).toBeCloseTo(0.2)
  })
  it('la restauración dura 1.1 s y sube de forma monótona', () => {
    let a = stepAnim(undefined, 0.1, 0, false)
    a = stepAnim(a, 1, 0, false)
    expect(a.dur).toBe(RESTORE_MS)
    let prev = a.cur
    for (let t = 100; t <= RESTORE_MS; t += 100) {
      a = stepAnim(a, 1, t, false)
      expect(a.cur).toBeGreaterThanOrEqual(prev)
      prev = a.cur
    }
    expect(prev).toBeCloseTo(1)
  })
  it('con movimiento reducido el cambio es casi inmediato', () => {
    let a = stepAnim(undefined, 1, 0, true)
    a = stepAnim(a, 0.1, 0, true)
    expect(a.dur).toBe(REDUCED_MS)
  })
  it('un cambio nuevo a mitad de animación parte de donde está', () => {
    let a = stepAnim(undefined, 1, 0, false)
    a = stepAnim(a, 0, 0, false)
    a = stepAnim(a, 0, 500, false)
    const mid = a.cur
    a = stepAnim(a, 1, 500, false)
    expect(a.from).toBe(mid)
  })
})

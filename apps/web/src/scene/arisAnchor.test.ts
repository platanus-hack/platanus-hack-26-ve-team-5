import { describe, expect, it } from 'vitest'
import { ARIS_OFFSET, arisAngleFromCenter, arisVisible } from './arisAnchor'

describe('arisAnchor', () => {
  it('Aris queda claramente fuera del centro de la vista', () => {
    expect(arisAngleFromCenter()).toBeGreaterThanOrEqual(25)
    expect(Math.hypot(ARIS_OFFSET.side, ARIS_OFFSET.down)).toBeGreaterThan(0.9)
  })
  it('solo es visible en el palacio', () => {
    expect(arisVisible('room')).toBe(true)
    for (const p of ['entering', 'inside', 'leaving']) expect(arisVisible(p)).toBe(false)
  })
})

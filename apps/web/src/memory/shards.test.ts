import { describe, expect, it } from 'vitest'
import { detach, shardLayout, SHARDS_PER_CONCEPT } from './shards'

describe('shardLayout', () => {
  it('es determinista por concepto', () => {
    expect(shardLayout('c1')).toEqual(shardLayout('c1'))
    expect(shardLayout('c1')).not.toEqual(shardLayout('c2'))
  })
  it('los umbrales descienden y no hay fragmentos antes de 0.6', () => {
    const s = shardLayout('c1')
    expect(s).toHaveLength(SHARDS_PER_CONCEPT)
    expect(s[0].thr).toBeLessThanOrEqual(0.6)
    for (let i = 1; i < s.length; i++) expect(s[i].thr).toBeLessThan(s[i - 1].thr)
  })
  it('detach: intacto a fuerza alta, caído a fuerza baja', () => {
    expect(detach(0.6, 0.9)).toBe(0)
    expect(detach(0.6, 0.1)).toBe(1)
    expect(detach(0.6, 0.54)).toBeCloseTo(0.5)
  })
})

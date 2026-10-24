import { describe, expect, it } from 'vitest'
import { parseDiorama } from '@mus3o/shared'
import { fireLights, MAX_FIRE_LIGHTS } from './fires'
import { getDioramaModel } from './model'

const build = (props: unknown[]) =>
  getDioramaModel(parseDiorama({ title: 'Fuegos', terrain: 'plain', time: 'night', props }))

describe('fireLights', () => {
  it('30 hogueras generan como mucho 3 luces', () => {
    const model = build([{ kind: 'campfire', pos: [0, 0], count: 30, spread: 8 }])
    const placed = model.groups.reduce((n, g) => n + g.instances.length, 0)
    expect(placed).toBeGreaterThan(MAX_FIRE_LIGHTS)
    const lights = fireLights(model.groups)
    expect(lights.length).toBeLessThanOrEqual(3)
    expect(new Set(lights.map((l) => l.key)).size).toBe(lights.length)
  })

  it('una sola hoguera sigue iluminando', () => {
    expect(fireLights(build([{ kind: 'campfire', pos: [0, 0] }]).groups)).toHaveLength(1)
  })

  it('sin hogueras no hay luces', () => {
    expect(fireLights(build([{ kind: 'tree', pos: [0, 0] }]).groups)).toHaveLength(0)
  })
})

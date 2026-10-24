import type { PropGroup } from './model'

/** Tope de luces puntuales por diorama: cada una encarece todos los materiales de la escena. */
export const MAX_FIRE_LIGHTS = 3

export type FireLight = {
  key: string
  position: [number, number, number]
  color: string
  intensity: number
  distance: number
}

/**
 * Luces de las hogueras del diorama, como mucho `max` (las primeras en orden de colocación).
 * El resto de hogueras conserva su malla de llama pero no ilumina.
 */
export function fireLights(groups: PropGroup[], max = MAX_FIRE_LIGHTS): FireLight[] {
  const out: FireLight[] = []
  for (const g of groups) {
    const l = g.built.light
    if (!l) continue
    for (let k = 0; k < g.instances.length; k++) {
      if (out.length >= max) return out
      const i = g.instances[k]
      out.push({
        key: `${g.index}-${g.variant}-${k}`,
        position: [i.x + l.offset[0], i.y + l.offset[1], i.z + l.offset[2]],
        color: l.color,
        intensity: l.intensity,
        distance: l.distance,
      })
    }
  }
  return out
}

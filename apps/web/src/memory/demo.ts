import type { Museum } from '@mus3o/shared'
import { hash } from '../palace/layout'
import { allConcepts, useStore } from '../store'
import { palaceKey } from './model'
import { useMemory } from './store'

// Estabilidades (días) repartidas por concepto, para que al pasar el tiempo unas piezas
// se rompan antes que otras: así el palacio envejece de forma desigual y se nota.
const SEED_STABILITIES = [1, 2.5, 6.25, 15.6]

/**
 * Solo demo. `?seed=learned` marca todos los conceptos como aprendidos ahora, con estabilidades variadas.
 * Se combina con `?dias=N` (desfase del reloj) para ver el palacio N días después.
 */
/** Solo demo y capturas. `?cam=x,z,yaw` coloca al jugador (metros y radianes) al entrar. */
export function applyDemoCamera() {
  const raw = new URLSearchParams(window.location.search).get('cam')
  const layout = useStore.getState().layout
  if (!raw || !layout) return
  const [x, z, yaw] = raw.split(',').map(Number)
  if ([x, z, yaw].every(Number.isFinite)) layout.spawn = { x, z, yaw }
}

/** Solo demo y capturas. `?salto=0@3000` cambia el desfase del reloj a 0 días a los 3 s (sirve para ver la restauración). */
export function applyDemoJump() {
  const m = new URLSearchParams(window.location.search).get('salto')?.match(/^(\d+(?:\.\d+)?)@(\d+)$/)
  if (m) setTimeout(() => useMemory.getState().setOffset(Number(m[1])), Number(m[2]))
}

export function applyDemoSeed(palace: Museum) {
  const params = new URLSearchParams(window.location.search)
  if (params.get('seed') !== 'learned') return
  const stabilities: Record<string, number> = {}
  const memorized: Record<string, true> = {}
  for (const c of allConcepts(palace)) {
    stabilities[c.id] = SEED_STABILITIES[hash(c.id) % SEED_STABILITIES.length]
    memorized[c.id] = true
  }
  useMemory.getState().seed(palaceKey(palace), stabilities)
  useStore.setState({ memorized })
}

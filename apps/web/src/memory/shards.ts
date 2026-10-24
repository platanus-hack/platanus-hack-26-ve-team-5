import { hash } from '../palace/layout'

// Fragmentos de yeso deterministas por concepto: la misma pieza siempre se desmorona igual.
// Cada fragmento tiene un "hogar" (sobre el objeto) y un "reposo" (en el pedestal o el suelo),
// y un umbral de fuerza: al bajar de ese umbral se desprende, al subir vuelve a su hogar.

export const SHARDS_PER_CONCEPT = 20
export const PEDESTAL_TOP = 1.05

type V3 = [number, number, number]

export type Shard = {
  thr: number
  home: V3
  rest: V3
  size: V3
  rot: V3
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shardLayout(conceptId: string, count = SHARDS_PER_CONCEPT): Shard[] {
  const rnd = mulberry32(hash(conceptId))
  const out: Shard[] = []
  for (let i = 0; i < count; i++) {
    const base = 0.045 + rnd() * 0.07
    const size: V3 = [base * (0.6 + rnd() * 0.9), base * (0.5 + rnd() * 0.8), base * (0.6 + rnd() * 0.9)]
    const a = rnd() * Math.PI * 2
    const hr = 0.14 + rnd() * 0.16
    const home: V3 = [Math.cos(a) * hr, 1.25 + rnd() * 0.55, Math.sin(a) * hr]
    let rest: V3
    if (rnd() < 0.62) {
      // Montón sobre la tapa del pedestal, más alto hacia el centro.
      const r = 0.4 * Math.sqrt(rnd())
      const b = rnd() * Math.PI * 2
      rest = [Math.cos(b) * r, PEDESTAL_TOP + base * 0.45 + 0.1 * Math.max(0, 1 - r / 0.4) * rnd(), Math.sin(b) * r]
    } else {
      // Cascotes caídos alrededor.
      const r = 0.55 + rnd() * 0.6
      const b = rnd() * Math.PI * 2
      rest = [Math.cos(b) * r, base * 0.4, Math.sin(b) * r]
    }
    out.push({
      thr: 0.6 - 0.55 * (i / (count - 1)),
      home,
      rest,
      size,
      rot: [rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2],
    })
  }
  return out
}

/** Cuánto se ha desprendido un fragmento: 0 en su sitio, 1 caído. */
export function detach(thr: number, strength: number): number {
  return Math.min(1, Math.max(0, (thr - strength) / 0.12))
}

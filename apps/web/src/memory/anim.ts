// Fuerza "mostrada" por concepto: persigue a la fuerza real con una animación corta, para que al saltar
// el tiempo se vea envejecer el palacio (≈1.5 s) y al repasar se vea reconstruirse (≈1.1 s).
// Puro: el tiempo entra como argumento.

export type Anim = { cur: number; from: number; to: number; t0: number; dur: number }

export const DECAY_MS = 1500
export const RESTORE_MS = 1100
export const REDUCED_MS = 250

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3)

export function stepAnim(a: Anim | undefined, target: number, tMs: number, reduced: boolean): Anim {
  if (!a) return { cur: target, from: target, to: target, t0: tMs, dur: 0 }
  let { from, to, t0, dur } = a
  if (Math.abs(target - to) > 0.01) {
    from = a.cur
    to = target
    t0 = tMs
    dur = reduced ? REDUCED_MS : target > a.cur ? RESTORE_MS : DECAY_MS
  }
  const k = dur > 0 ? Math.min(1, (tMs - t0) / dur) : 1
  // Sin animación en curso, sigue de cerca la deriva lenta del tiempo real.
  const cur = k >= 1 ? target : from + (to - from) * easeOutCubic(k)
  return { cur, from, to: k >= 1 ? target : to, t0, dur }
}

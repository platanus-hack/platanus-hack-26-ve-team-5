import type { Anim } from './anim'

// Registros en memoria que escribe la escena 3D cada frame y que leen el minimapa y los objetos.
// Están aparte de Decay.tsx para que la UI no arrastre three.js a su bundle.

/** Ángulo de giro de cada objeto; los fragmentos lo siguen para salir del lugar correcto. */
export const spinOf = new Map<string, number>()
/** Fuerza "mostrada" (suavizada) por concepto. */
export const shown = new Map<string, Anim>()
/** Fuerza mostrada promedio por sala, sobre los conceptos ya aprendidos. */
export const roomShown = new Map<string, number>()

export const shownStrength = (id: string) => shown.get(id)?.cur ?? 1
export const roomStrength = (roomId: string) => roomShown.get(roomId) ?? 1

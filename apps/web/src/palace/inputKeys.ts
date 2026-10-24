import type { Phase } from '../diorama/dioramaStore'
import type { PalaceLayout } from './layout'

export type KeyContext = {
  /** La intro "El palacio se levanta" está volando la cámara. */
  introActive: boolean
  /** Fase del cuadro: 'room' = en el palacio; el resto, dentro o en transición. */
  dioramaPhase: Phase
  /** Hay un concepto enfocado o abierto (dentro del cuadro, solo los props enlazados lo activan). */
  hasConcept: boolean
}

/**
 * Teclas de juego que Player puede procesar en cada contexto.
 * - Intro: ninguna.
 * - Palacio: E examinar/entrar, M memorizar, T Aris, N narrador.
 * - Entrando/saliendo del cuadro: solo N (E se consume en handleDioramaKey).
 * - Dentro del cuadro: E (examinar prop enlazado), Q (volver), N; M solo con un concepto enlazado; sin T.
 */
export function allowedKeys(ctx: KeyContext): ReadonlySet<string> {
  if (ctx.introActive) return new Set()
  switch (ctx.dioramaPhase) {
    case 'room':
      return new Set(['KeyE', 'KeyM', 'KeyT', 'KeyN'])
    case 'inside': {
      const keys = ['KeyE', 'KeyQ', 'KeyN']
      if (ctx.hasConcept) keys.push('KeyM')
      return new Set(keys)
    }
    default:
      return new Set(['KeyN'])
  }
}

/** Puerta por id en el layout vigente (Player la consulta con el layout actual, no el de su primer render). */
export function findDoor(layout: PalaceLayout | null | undefined, id: string | null) {
  return id ? layout?.doors?.find((d) => d.id === id) : undefined
}

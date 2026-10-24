import { create } from 'zustand'
import type { PalaceLayout } from '../palace/layout'
import { introTimeline, type IntroTimeline } from './timeline'

/**
 * Estado de "El palacio se levanta". `introState` es mutable y se lee por frame (sin re-render);
 * `useIntro` solo cambia al empezar y al terminar (UI).
 */
export const introState: {
  active: boolean
  /** Segundos de intro transcurridos. */
  t: number
  timeline: IntroTimeline | null
  /** ?introAt=<s>: congela el reloj en ese instante (solo capturas y depuración). */
  frozenAt: number | null
} = { active: false, t: 0, timeline: null, frozenAt: null }

type Phase = 'idle' | 'playing' | 'done'
type IntroUi = { phase: Phase; reduced: boolean }
export const useIntro = create<IntroUi>(() => ({ phase: 'idle', reduced: false }))
// beginIntro se llama durante el render de World: la UI se actualiza fuera de él.
const setUi = (ui: IntroUi) => queueMicrotask(() => useIntro.setState(ui))

const played = new Set<string>()
let startedFor: PalaceLayout | null = null

export type IntroOptions = {
  /** Identifica el palacio: la intro solo corre la primera vez que se entra en él en esta sesión. */
  key: string
  /** 'on' (?intro=1) fuerza; 'off' (?intro=0) desactiva. */
  force?: 'on' | 'off' | null
  reducedMotion?: boolean
  frozenAt?: number | null
}

/** Idempotente por layout (StrictMode). Devuelve si hay intro con vuelo. */
export function beginIntro(layout: PalaceLayout, opts: IntroOptions): boolean {
  if (startedFor === layout) return introState.active
  startedFor = layout
  const replay = opts.force === 'on'
  if (opts.force === 'off' || (!replay && played.has(opts.key))) {
    introState.active = false
    setUi({ phase: 'done', reduced: false })
    return false
  }
  played.add(opts.key)
  if (opts.reducedMotion) {
    // Sin vuelo: todo ya está construido; solo un fundido corto (IntroOverlay).
    introState.active = false
    setUi({ phase: 'playing', reduced: true })
    return false
  }
  introState.timeline = introTimeline(layout)
  introState.t = 0
  introState.frozenAt = opts.frozenAt ?? null
  introState.active = true
  setUi({ phase: 'playing', reduced: false })
  return true
}

/** Salta al estado final: todo levantado y la cámara en el punto de entrada. */
export function skipIntro() {
  if (introState.active && introState.timeline) {
    introState.frozenAt = null
    introState.t = introState.timeline.total
  } else if (useIntro.getState().phase === 'playing') {
    useIntro.setState({ phase: 'done' })
  }
}

export function finishIntro() {
  introState.active = false
  useIntro.setState({ phase: 'done' })
}

/** Corta una intro en curso (al salir del palacio). No toca el registro de palacios ya vistos en la sesión. */
export function abortIntro() {
  if (!introState.active) return
  introState.active = false
  useIntro.setState({ phase: 'done' })
}

/** Solo pruebas. */
export function resetIntroForTests() {
  played.clear()
  startedFor = null
  introState.active = false
  introState.t = 0
  introState.timeline = null
  introState.frozenAt = null
  useIntro.setState({ phase: 'idle', reduced: false })
}

import { create } from 'zustand'
import type { Diorama } from '@mus3o/shared'

// Estado del "Entrar al cuadro". Va aparte de store.ts para no pisar el trabajo de otras
// ramas; Player.tsx solo consulta handleDioramaKey() y isDioramaActive().

export type Phase = 'room' | 'entering' | 'inside' | 'leaving'

export type PortalInfo = {
  id: string
  diorama: Diorama
  /** Centro del cuadro en el palacio (m). */
  center: [number, number, number]
  rotationY: number
  width: number
  height: number
  /** Sala que contiene el cuadro (para la vista de regreso). */
  roomId?: string
}

type State = {
  phase: Phase
  activeId: string | null
  portals: Record<string, PortalInfo>
  /** Cuadro al alcance que se está mirando (ofrece "E · Entrar"). */
  hintId: string | null
  /** El jugador está cerca del marco de regreso. */
  nearReturn: boolean
  registerPortal: (p: PortalInfo) => void
  unregisterPortal: (id: string) => void
  setHint: (id: string | null) => void
  setNearReturn: (v: boolean) => void
  setPhase: (phase: Phase, activeId?: string | null) => void
}

export const useDioramaStore = create<State>((set) => ({
  phase: 'room',
  activeId: null,
  portals: {},
  hintId: null,
  nearReturn: false,
  registerPortal: (p) => set((s) => ({ portals: { ...s.portals, [p.id]: p } })),
  unregisterPortal: (id) =>
    set((s) => {
      const portals = { ...s.portals }
      delete portals[id]
      return { portals, hintId: s.hintId === id ? null : s.hintId }
    }),
  setHint: (hintId) => set({ hintId }),
  setNearReturn: (nearReturn) => set({ nearReturn }),
  setPhase: (phase, activeId) => set((s) => ({ phase, activeId: activeId === undefined ? s.activeId : activeId })),
}))

/** Velo de color de la transición; se muta cada frame sin pasar por React. */
export const dioramaFx = { fade: 0, color: '#d6cfc4' }

/** Solicitudes de transición: las atiende DioramaRuntime dentro del bucle de render. */
export const dioramaRequest: { enter: string | null; leave: boolean } = { enter: null, leave: false }

export const isDioramaActive = () => useDioramaStore.getState().phase !== 'room'

/** Vuelve al palacio y olvida el cuadro activo, pistas y solicitudes pendientes (cambio de palacio, aunque el runtime no llegara a montarse). */
export function resetDioramaState() {
  useDioramaStore.setState({ phase: 'room', activeId: null, hintId: null, nearReturn: false })
  dioramaRequest.enter = null
  dioramaRequest.leave = false
  dioramaFx.fade = 0
}

/**
 * Atajos del cuadro. Devuelve true si consume la tecla (Player no debe procesarla).
 * E: entrar al cuadro que se mira. Q: volver a la sala. Dentro del diorama, E sigue siendo
 * "examinar concepto" y lo gestiona Player con el mismo focusedId de siempre.
 */
export function handleDioramaKey(code: string): boolean {
  const s = useDioramaStore.getState()
  if (code === 'KeyE') {
    if (s.phase === 'room' && s.hintId) {
      dioramaRequest.enter = s.hintId
      return true
    }
    return s.phase === 'entering' || s.phase === 'leaving'
  }
  if (code === 'KeyQ' && (s.phase === 'inside' || s.phase === 'entering')) {
    if (s.phase === 'inside') dioramaRequest.leave = true
    return true
  }
  return false
}

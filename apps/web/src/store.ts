import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { buildLayout, type PalaceLayout } from './palace/layout'
import { MuseumSchema, type Museum } from '@mus3o/shared'
import { dueIds, palaceKey, strengthOf } from './memory/model'
import { nowMs, useMemory } from './memory/store'

export type Screen = 'landing' | 'palace'
export type Mode = 'explore' | 'exam'
export type ExamResult = 'ok' | 'fail'

// Pose del jugador: se escribe cada frame, se lee desde el minimapa sin re-renderizar React.
export const playerPose = { x: 0, z: 0, yaw: 0 }

type State = {
  screen: Screen
  mode: Mode
  palace: Museum | null
  layout: PalaceLayout | null
  memorized: Record<string, true>
  exam: Record<string, ExamResult>
  /** Repaso: si no es null, el examen solo cubre estos conceptos (los pendientes). */
  reviewIds: string[] | null
  currentRoomId: string | null
  focusedId: string | null
  focusedDoorId: string | null
  openId: string | null
  locked: boolean
  hasKey: boolean
  unlockedDoors: Record<string, true>

  enterPalace: (palace: Museum) => void
  resume: () => void
  exitToLanding: () => void
  setMode: (mode: Mode) => void
  /** Examen limitado a lo pendiente. Devuelve false si no hay nada que repasar. */
  startReview: () => boolean
  toggleMemorized: (id: string) => void
  pickupKey: () => void
  unlockDoor: (doorId: string) => void
  recordExam: (id: string, result: ExamResult) => void
  set: (patch: Partial<Pick<State, 'currentRoomId' | 'focusedId' | 'focusedDoorId' | 'openId' | 'locked'>>) => void
}

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage
  } catch {
    return undefined as unknown as Storage
  }
})

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      screen: 'landing',
      mode: 'explore',
      palace: null,
      layout: null,
      memorized: {},
      exam: {},
      reviewIds: null,
      currentRoomId: null,
      focusedId: null,
      focusedDoorId: null,
      openId: null,
      locked: false,
      hasKey: false,
      unlockedDoors: {},

      enterPalace: (palace) =>
        set({
          palace,
          layout: buildLayout(palace),
          screen: 'palace',
          mode: 'explore',
          memorized: learnedMap(palace),
          exam: {},
          reviewIds: null,
          openId: null,
          focusedId: null,
          focusedDoorId: null,
          hasKey: false,
          unlockedDoors: {},
        }),
      resume: () => set((s) => (s.palace ? { screen: 'palace', layout: s.layout ?? buildLayout(s.palace) } : {})),
      exitToLanding: () => set({ screen: 'landing', openId: null, focusedId: null, focusedDoorId: null }),
      setMode: (mode) => set({ mode, openId: null, exam: {}, reviewIds: null }),
      startReview: () => {
        const { palace } = get()
        if (!palace) return false
        const mem = useMemory.getState().palaces[palaceKey(palace)] ?? {}
        const ids = dueIds(mem, allConcepts(palace).map((c) => c.id), nowMs())
        if (!ids.length) return false
        set({ mode: 'exam', openId: null, exam: {}, reviewIds: ids })
        return true
      },
      pickupKey: () => set({ hasKey: true }),
      unlockDoor: (doorId) => set((s) => ({ unlockedDoors: { ...s.unlockedDoors, [doorId]: true } })),
      toggleMemorized: (id) =>
        set((s) => {
          const memorized = { ...s.memorized }
          const key = s.palace ? palaceKey(s.palace) : null
          const rec = key ? useMemory.getState().palaces[key]?.[id] : undefined
          // Si ya estaba memorizado pero se olvidó, M es un repaso: restaura en vez de desmarcar.
          if (memorized[id] && rec && strengthOf(rec, nowMs()) < 0.85) {
            useMemory.getState().learn(key!, id)
            return {}
          }
          if (memorized[id]) delete memorized[id]
          else {
            memorized[id] = true
            if (key) useMemory.getState().learn(key, id)
          }
          return { memorized }
        }),
      recordExam: (id, result) =>
        set((s) => {
          if (s.palace) useMemory.getState().exam(palaceKey(s.palace), id, result === 'ok')
          return { exam: { ...s.exam, [id]: result } }
        }),
      set: (patch) => set(patch),
    }),
    {
      name: 'mus3o-v1',
      storage: safeStorage,
      // Solo el contenido y el progreso; el layout se recalcula.
      partialize: (s) => ({ palace: s.palace, memorized: s.memorized }),
      // Lo guardado puede estar corrupto o venir de otra versión: se valida antes de usarlo.
      merge: (persisted, current) => {
        const p = persisted as { palace?: unknown; memorized?: unknown } | undefined
        const palace = MuseumSchema.safeParse(p?.palace)
        if (!palace.success) return current
        const memorized =
          p?.memorized && typeof p.memorized === 'object' ? (p.memorized as Record<string, true>) : {}
        return { ...current, palace: palace.data, memorized }
      },
    },
  ),
)

export function allConcepts(palace: Museum | null) {
  return palace?.rooms.flatMap((r) => r.pieces) ?? []
}

/** Conceptos con registro de memoria: se ven como memorizados (banda dorada) al volver a entrar. */
function learnedMap(palace: Museum): Record<string, true> {
  const mem = useMemory.getState().palaces[palaceKey(palace)] ?? {}
  const out: Record<string, true> = {}
  for (const c of allConcepts(palace)) if (mem[c.id]) out[c.id] = true
  return out
}

/** ¿Este concepto se pregunta en el examen actual? (todo, o solo lo pendiente en un repaso) */
export function inExamScope(s: Pick<State, 'mode' | 'reviewIds'>, id: string): boolean {
  return s.mode === 'exam' && (!s.reviewIds || s.reviewIds.includes(id))
}

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { buildLayout, type PalaceLayout } from './palace/layout'
import { MuseumSchema, type Museum } from '@mus3o/shared'

export type Screen = 'landing' | 'palace'
export type Mode = 'explore' | 'exam'
export type ExamResult = 'ok' | 'fail'

// Pose del jugador: se escribe cada frame, se lee desde el minimapa sin re-renderizar React.
export const playerPose = { x: 0, z: 0, yaw: 0 }

type State = {
  screen: Screen
  mode: Mode
  palace: Museum | null
  /** Apuntes del usuario (≤ 50 KB) para mostrar el contexto de cada fuente; se quedan en su dispositivo. */
  sourceText: string | null
  layout: PalaceLayout | null
  memorized: Record<string, true>
  exam: Record<string, ExamResult>
  currentRoomId: string | null
  focusedId: string | null
  focusedDoorId: string | null
  openId: string | null
  locked: boolean
  hasKey: boolean
  unlockedDoors: Record<string, true>

  enterPalace: (palace: Museum, sourceText?: string | null) => void
  resume: () => void
  exitToLanding: () => void
  setMode: (mode: Mode) => void
  toggleMemorized: (id: string) => void
  pickupKey: () => void
  unlockDoor: (doorId: string) => void
  recordExam: (id: string, result: ExamResult) => void
  set: (patch: Partial<Pick<State, 'currentRoomId' | 'focusedId' | 'focusedDoorId' | 'openId' | 'locked'>>) => void
}

export const MAX_SOURCE_TEXT = 50_000

/** Lo guardado puede estar manipulado: solo se acepta texto y dentro del tope. */
export const capSourceText = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, MAX_SOURCE_TEXT) : null

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage
  } catch {
    return undefined as unknown as Storage
  }
})

export const useStore = create<State>()(
  persist(
    (set) => ({
      screen: 'landing',
      mode: 'explore',
      palace: null,
      sourceText: null,
      layout: null,
      memorized: {},
      exam: {},
      currentRoomId: null,
      focusedId: null,
      focusedDoorId: null,
      openId: null,
      locked: false,
      hasKey: false,
      unlockedDoors: {},

      enterPalace: (palace, sourceText) =>
        set({
          palace,
          sourceText: capSourceText(sourceText),
          layout: buildLayout(palace),
          screen: 'palace',
          mode: 'explore',
          memorized: {},
          exam: {},
          openId: null,
          focusedId: null,
          focusedDoorId: null,
          hasKey: false,
          unlockedDoors: {},
        }),
      resume: () => set((s) => (s.palace ? { screen: 'palace', layout: s.layout ?? buildLayout(s.palace) } : {})),
      exitToLanding: () => set({ screen: 'landing', openId: null, focusedId: null, focusedDoorId: null }),
      setMode: (mode) => set({ mode, openId: null, exam: {} }),
      pickupKey: () => set({ hasKey: true }),
      unlockDoor: (doorId) => set((s) => ({ unlockedDoors: { ...s.unlockedDoors, [doorId]: true } })),
      toggleMemorized: (id) =>
        set((s) => {
          const memorized = { ...s.memorized }
          if (memorized[id]) delete memorized[id]
          else memorized[id] = true
          return { memorized }
        }),
      recordExam: (id, result) => set((s) => ({ exam: { ...s.exam, [id]: result } })),
      set: (patch) => set(patch),
    }),
    {
      name: 'mus3o-v1',
      storage: safeStorage,
      // Solo el contenido y el progreso; el layout se recalcula.
      partialize: (s) => ({ palace: s.palace, sourceText: s.sourceText, memorized: s.memorized }),
      // Lo guardado puede estar corrupto o venir de otra versión: se valida antes de usarlo.
      merge: (persisted, current) => {
        const p = persisted as { palace?: unknown; sourceText?: unknown; memorized?: unknown } | undefined
        const palace = MuseumSchema.safeParse(p?.palace)
        if (!palace.success) return current
        const memorized =
          p?.memorized && typeof p.memorized === 'object' ? (p.memorized as Record<string, true>) : {}
        return { ...current, palace: palace.data, sourceText: capSourceText(p?.sourceText), memorized }
      },
    },
  ),
)

export function allConcepts(palace: Museum | null) {
  return palace?.rooms.flatMap((r) => r.pieces) ?? []
}

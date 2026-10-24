import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { buildLayout, type PalaceLayout } from './palace/layout'
import { PalaceSchema, type Palace } from './palace/schema'

export type Screen = 'landing' | 'palace'
export type Mode = 'explore' | 'exam'
export type ExamResult = 'ok' | 'fail'

// Pose del jugador: se escribe cada frame, se lee desde el minimapa sin re-renderizar React.
export const playerPose = { x: 0, z: 0, yaw: 0 }

type State = {
  screen: Screen
  mode: Mode
  palace: Palace | null
  layout: PalaceLayout | null
  memorized: Record<string, true>
  exam: Record<string, ExamResult>
  currentRoomId: string | null
  focusedId: string | null
  openId: string | null
  locked: boolean

  enterPalace: (palace: Palace) => void
  resume: () => void
  exitToLanding: () => void
  setMode: (mode: Mode) => void
  toggleMemorized: (id: string) => void
  recordExam: (id: string, result: ExamResult) => void
  set: (patch: Partial<Pick<State, 'currentRoomId' | 'focusedId' | 'openId' | 'locked'>>) => void
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
    (set) => ({
      screen: 'landing',
      mode: 'explore',
      palace: null,
      layout: null,
      memorized: {},
      exam: {},
      currentRoomId: null,
      focusedId: null,
      openId: null,
      locked: false,

      enterPalace: (palace) =>
        set({
          palace,
          layout: buildLayout(palace),
          screen: 'palace',
          mode: 'explore',
          memorized: {},
          exam: {},
          openId: null,
          focusedId: null,
        }),
      resume: () => set((s) => (s.palace ? { screen: 'palace', layout: s.layout ?? buildLayout(s.palace) } : {})),
      exitToLanding: () => set({ screen: 'landing', openId: null, focusedId: null }),
      setMode: (mode) => set({ mode, openId: null, exam: {} }),
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
      name: 'locigen-v1',
      storage: safeStorage,
      // Solo el contenido y el progreso; el layout se recalcula.
      partialize: (s) => ({ palace: s.palace, memorized: s.memorized }),
      // Lo guardado puede estar corrupto o venir de otra versión: se valida antes de usarlo.
      merge: (persisted, current) => {
        const p = persisted as { palace?: unknown; memorized?: unknown } | undefined
        const palace = PalaceSchema.safeParse(p?.palace)
        if (!palace.success) return current
        const memorized =
          p?.memorized && typeof p.memorized === 'object' ? (p.memorized as Record<string, true>) : {}
        return { ...current, palace: palace.data, memorized }
      },
    },
  ),
)

export function allConcepts(palace: Palace | null) {
  return palace?.rooms.flatMap((r) => r.concepts) ?? []
}

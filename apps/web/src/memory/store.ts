import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DAY_MS, applyExam, markLearned, sanitizePalaces, type PalaceMemory } from './model'

// Memoria del usuario por palacio. Va en su propio store para no mezclarla con el contenido del palacio.
type MemState = {
  palaces: Record<string, PalaceMemory>
  /** Desfase del reloj en días: la "máquina del tiempo" de la demo. No se guarda. */
  timeOffsetDays: number
  setOffset: (days: number) => void
  learn: (key: string, id: string) => void
  exam: (key: string, id: string, ok: boolean) => void
  /** Solo demo: marca todo como aprendido con estabilidades variadas (ver ?seed=learned). */
  seed: (key: string, stabilities: Record<string, number>) => void
  reset: (key: string) => void
}

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage
  } catch {
    return undefined as unknown as Storage
  }
})

export function clampDays(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 3650) : 0
}

function initialOffset(): number {
  try {
    const q = new URLSearchParams(window.location.search).get('dias')
    return q === null ? 0 : clampDays(q)
  } catch {
    return 0
  }
}

export const useMemory = create<MemState>()(
  persist(
    (set, get) => ({
      palaces: {},
      timeOffsetDays: initialOffset(),
      setOffset: (days) => set({ timeOffsetDays: clampDays(days) }),
      learn: (key, id) =>
        set((s) => ({
          palaces: { ...s.palaces, [key]: { ...s.palaces[key], [id]: markLearned(s.palaces[key]?.[id], nowMs()) } },
        })),
      exam: (key, id, ok) =>
        set((s) => ({
          palaces: { ...s.palaces, [key]: { ...s.palaces[key], [id]: applyExam(s.palaces[key]?.[id], ok, nowMs()) } },
        })),
      seed: (key, stabilities) => {
        const t = Date.now()
        const mem: PalaceMemory = {}
        for (const [id, stability] of Object.entries(stabilities)) {
          mem[id] = { stability, lastReview: t, reviews: 1, lapses: 0, history: [{ t, ok: true }] }
        }
        set({ palaces: { ...get().palaces, [key]: mem } })
      },
      reset: (key) =>
        set((s) => {
          const palaces = { ...s.palaces }
          delete palaces[key]
          return { palaces }
        }),
    }),
    {
      name: 'mus3o-memory-v1',
      storage: safeStorage,
      partialize: (s) => ({ palaces: s.palaces }),
      // Lo guardado puede estar corrupto: se valida y se descarta lo ilegible.
      merge: (persisted, current) => {
        const p = persisted as { palaces?: unknown } | undefined
        return { ...current, palaces: sanitizePalaces(p?.palaces) }
      },
    },
  ),
)

/** "Ahora" en ms, incluido el desfase de la máquina del tiempo. */
export function nowMs(): number {
  return Date.now() + useMemory.getState().timeOffsetDays * DAY_MS
}

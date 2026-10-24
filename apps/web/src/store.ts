import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { earnedRoomKeys } from './palace/keys'
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
  /** Exploración libre: todas las puertas abiertas, sin llaves. Preferencia del usuario. */
  freeExplore: boolean
  /** Llave de cada sala ganada al memorizar todas sus piezas. No se pierde al desmarcar. */
  roomKeys: Record<string, true>
  /** Sala cuya llave se acaba de ganar, para avisarlo en el HUD. */
  lastKeyRoomId: string | null

  enterPalace: (palace: Museum) => void
  resume: () => void
  exitToLanding: () => void
  setMode: (mode: Mode) => void
  /** Examen limitado a lo pendiente. Devuelve false si no hay nada que repasar. */
  startReview: () => boolean
  toggleMemorized: (id: string) => void
  pickupKey: () => void
  unlockDoor: (doorId: string) => void
  setFreeExplore: (on: boolean) => void
  recordExam: (id: string, result: ExamResult) => void
  set: (patch: Partial<Pick<State, 'currentRoomId' | 'focusedId' | 'focusedDoorId' | 'openId' | 'locked' | 'lastKeyRoomId'>>) => void
}

type Progress = Pick<State, 'palace' | 'memorized' | 'exam' | 'roomKeys' | 'lastKeyRoomId'>

// Suma las llaves recién ganadas a las que ya se tenían y avisa la última.
function withEarnedKeys(s: Progress, memorized: Record<string, true>, exam: State['exam']) {
  if (!s.palace) return {}
  const earned = earnedRoomKeys(s.palace, memorized, exam)
  const fresh = Object.keys(earned).filter((id) => !s.roomKeys[id])
  if (fresh.length === 0) return {}
  return { roomKeys: { ...s.roomKeys, ...earned }, lastKeyRoomId: fresh[fresh.length - 1] }
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
      freeExplore: true,
      roomKeys: {},
      lastKeyRoomId: null,

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
          // Las salas sin nada que memorizar ya tienen su llave.
          roomKeys: earnedRoomKeys(palace, {}, {}),
          lastKeyRoomId: null,
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
      setFreeExplore: (freeExplore) => set({ freeExplore }),
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
          return { memorized, ...withEarnedKeys(s, memorized, s.exam) }
        }),
      recordExam: (id, result) =>
        set((s) => {
          if (s.palace) useMemory.getState().exam(palaceKey(s.palace), id, result === 'ok')
          const exam = { ...s.exam, [id]: result }
          return { exam, ...withEarnedKeys(s, s.memorized, exam) }
        }),
      set: (patch) => set(patch),
    }),
    {
      name: 'mus3o-v1',
      storage: safeStorage,
      // Solo el contenido y el progreso; el layout se recalcula.
      partialize: (s) => ({
        palace: s.palace,
        memorized: s.memorized,
        roomKeys: s.roomKeys,
        unlockedDoors: s.unlockedDoors,
        freeExplore: s.freeExplore,
      }),
      // Lo guardado puede estar corrupto o venir de otra versión: se valida antes de usarlo.
      merge: (persisted, current) => {
        const p = persisted as
          | { palace?: unknown; memorized?: unknown; roomKeys?: unknown; unlockedDoors?: unknown; freeExplore?: unknown }
          | undefined
        const freeExplore = typeof p?.freeExplore === 'boolean' ? p.freeExplore : current.freeExplore
        const palace = MuseumSchema.safeParse(p?.palace)
        if (!palace.success) return { ...current, freeExplore }
        const record = (value: unknown) =>
          value && typeof value === 'object' ? (value as Record<string, true>) : {}
        const memorized = record(p?.memorized)
        // Las llaves guardadas se completan con las que corresponden al progreso guardado.
        const roomKeys = { ...record(p?.roomKeys), ...earnedRoomKeys(palace.data, memorized, {}) }
        return { ...current, palace: palace.data, memorized, roomKeys, unlockedDoors: record(p?.unlockedDoors), freeExplore }
      },
    },
  ),
)

export function allConcepts(palace: Museum | null) {
  return palace?.rooms.flatMap((r) => r.pieces) ?? []
}

/** Una puerta está abierta si se desbloqueó con la llave o si se explora libremente. */
export function isDoorOpen(s: { freeExplore: boolean; unlockedDoors: Record<string, true> }, doorId: string) {
  return s.freeExplore || !!s.unlockedDoors[doorId]
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

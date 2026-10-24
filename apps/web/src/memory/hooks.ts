import { useMemo } from 'react'
import type { Museum } from '@mus3o/shared'
import { allConcepts, useStore } from '../store'
import { levelOf, palaceKey, roomMemory, strengthOf, type Level, type PalaceMemory, type RoomMemory } from './model'
import { nowMs, useMemory } from './store'

const EMPTY: PalaceMemory = {}

export function usePalaceKey(): string | null {
  const palace = useStore((s) => s.palace)
  return useMemo(() => (palace ? palaceKey(palace) : null), [palace])
}

/** Registros del palacio actual. Cambia al repasar o al saltar el tiempo (por eso lee timeOffsetDays). */
export function usePalaceMemory(): PalaceMemory {
  const key = usePalaceKey()
  return useMemory((s) => (key ? s.palaces[key] ?? EMPTY : EMPTY))
}

export function useConceptLevel(id: string): Level {
  const mem = usePalaceMemory()
  useMemory((s) => s.timeOffsetDays)
  return levelOf(mem[id], nowMs())
}

export function useConceptStrength(id: string): number {
  const mem = usePalaceMemory()
  useMemory((s) => s.timeOffsetDays)
  return strengthOf(mem[id], nowMs())
}

export function useRoomMemory(conceptIds: string[]): RoomMemory {
  const mem = usePalaceMemory()
  useMemory((s) => s.timeOffsetDays)
  return roomMemory(mem, conceptIds, nowMs())
}

/** Conceptos pendientes de repaso en todo el palacio. */
export function useDueCount(): number {
  const palace = useStore((s) => s.palace)
  const mem = usePalaceMemory()
  useMemory((s) => s.timeOffsetDays)
  return roomMemory(mem, allConcepts(palace).map((c) => c.id), nowMs()).due
}

/** Pendientes de un palacio guardado, para la landing. */
export function dueCountFor(palace: Museum | null): number {
  if (!palace) return 0
  const mem = useMemory.getState().palaces[palaceKey(palace)] ?? EMPTY
  return roomMemory(mem, allConcepts(palace).map((c) => c.id), nowMs()).due
}

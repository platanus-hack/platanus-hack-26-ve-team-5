import { z } from 'zod'

// Contrato compartido: lo que produce cualquier parser (texto, JSON, CSV, LLM)
// y lo que consume el generador de layout.
export const LIMITS = {
  maxInputChars: 50_000,
  maxRooms: 12,
  maxConceptsPerRoom: 16,
  maxTitle: 80,
  maxDetail: 400,
  maxMetaphor: 120,
} as const

export const ConceptSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(LIMITS.maxTitle),
  detail: z.string().max(LIMITS.maxDetail).default(''),
  metaphor: z.string().max(LIMITS.maxMetaphor).optional(),
})

export const RoomSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(LIMITS.maxTitle),
  concepts: z.array(ConceptSchema).max(LIMITS.maxConceptsPerRoom),
})

export const PalaceSchema = z.object({
  title: z.string().min(1).max(LIMITS.maxTitle),
  rooms: z.array(RoomSchema).min(1).max(LIMITS.maxRooms),
})

export type Concept = z.infer<typeof ConceptSchema>
export type Room = z.infer<typeof RoomSchema>
export type Palace = z.infer<typeof PalaceSchema>

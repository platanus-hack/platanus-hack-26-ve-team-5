// Modelo de memoria: curva de olvido exponencial por concepto. Puro y sin dependencias de UI.
// retrievability = exp(-díasTranscurridos / estabilidad)

export const DAY_MS = 86_400_000
export const DUE_THRESHOLD = 0.7
export const MAX_STABILITY = 365
export const HISTORY_CAP = 20
export const TIME_STEPS = [0, 1, 3, 7, 14, 30] as const

export type Review = { t: number; ok: boolean }

export type ConceptMemory = {
  /** Días hasta que el recuerdo cae a 1/e (≈37%). */
  stability: number
  lastReview: number
  reviews: number
  lapses: number
  history: Review[]
}

/** Registros de un palacio, por id de concepto. Un concepto sin registro es "nuevo". */
export type PalaceMemory = Record<string, ConceptMemory>

export type Level = 'new' | 'intact' | 'cracked' | 'broken' | 'forgotten'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Hash estable (FNV-1a) del contenido del museo: ids y títulos de salas y piezas. */
export function palaceKey(museum: { rooms: { id: string; name?: string; pieces: { id: string; title?: string }[] }[] }): string {
  let h = 2166136261
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    h = Math.imul(h ^ 0x1f, 16777619)
  }
  for (const r of museum.rooms) {
    feed(r.id)
    feed(r.name ?? '')
    for (const p of r.pieces) {
      feed(p.id)
      feed(p.title ?? '')
    }
  }
  return (h >>> 0).toString(36)
}

/** Fuerza del recuerdo en [0,1]. Sin registro devuelve 1 (nuevo: no decae hasta el primer repaso). */
export function strengthOf(rec: ConceptMemory | undefined, now: number): number {
  if (!rec) return 1
  const days = Math.max(0, (now - rec.lastReview) / DAY_MS)
  return Math.exp(-days / Math.max(rec.stability, 1e-6))
}

export function isDue(rec: ConceptMemory | undefined, now: number): boolean {
  return !!rec && strengthOf(rec, now) < DUE_THRESHOLD
}

export function levelFromStrength(s: number): Exclude<Level, 'new'> {
  if (s >= 0.85) return 'intact'
  if (s >= 0.6) return 'cracked'
  if (s >= 0.3) return 'broken'
  return 'forgotten'
}

export function levelOf(rec: ConceptMemory | undefined, now: number): Level {
  return !rec ? 'new' : levelFromStrength(strengthOf(rec, now))
}

function pushHistory(history: Review[], r: Review): Review[] {
  return [...history, r].slice(-HISTORY_CAP)
}

/** Marcar como memorizado (M): primer repaso exitoso con estabilidad de 1 día. Si ya existía, lo refresca. */
export function markLearned(rec: ConceptMemory | undefined, now: number): ConceptMemory {
  if (!rec) return { stability: 1, lastReview: now, reviews: 1, lapses: 0, history: [{ t: now, ok: true }] }
  return {
    ...rec,
    stability: Math.max(rec.stability, 1),
    lastReview: now,
    reviews: rec.reviews + 1,
    history: pushHistory(rec.history, { t: now, ok: true }),
  }
}

/** Resultado de examen: acierto multiplica la estabilidad por 2.5; fallo la hunde a 0.3 días. */
export function applyExam(rec: ConceptMemory | undefined, ok: boolean, now: number): ConceptMemory {
  const base = rec ?? { stability: 1, lastReview: now, reviews: 0, lapses: 0, history: [] }
  return {
    stability: ok ? clamp(Math.max(base.stability * 2.5, 1), 1, MAX_STABILITY) : 0.3,
    lastReview: now,
    reviews: base.reviews + 1,
    lapses: base.lapses + (ok ? 0 : 1),
    history: pushHistory(base.history, { t: now, ok }),
  }
}

export function dueIds(mem: PalaceMemory, ids: string[], now: number): string[] {
  return ids.filter((id) => isDue(mem[id], now))
}

export type RoomMemory = { strength: number; due: number; learned: number; total: number }

/** Promedio de fuerza de la sala sobre los conceptos ya aprendidos; si no hay ninguno, 1. */
export function roomMemory(mem: PalaceMemory, ids: string[], now: number): RoomMemory {
  let sum = 0
  let learned = 0
  let due = 0
  for (const id of ids) {
    const rec = mem[id]
    if (!rec) continue
    learned++
    const s = strengthOf(rec, now)
    sum += s
    if (s < DUE_THRESHOLD) due++
  }
  return { strength: learned ? sum / learned : 1, due, learned, total: ids.length }
}

// ---------- Validación de lo guardado ----------

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function sanitizeConcept(raw: unknown): ConceptMemory | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!finite(r.stability) || !finite(r.lastReview) || r.stability <= 0) return null
  const history = Array.isArray(r.history)
    ? r.history
        .filter((h): h is Review => !!h && typeof h === 'object' && finite((h as Review).t) && typeof (h as Review).ok === 'boolean')
        .map((h) => ({ t: h.t, ok: h.ok }))
        .slice(-HISTORY_CAP)
    : []
  return {
    stability: clamp(r.stability, 0.01, MAX_STABILITY),
    lastReview: r.lastReview,
    reviews: finite(r.reviews) ? Math.max(0, Math.floor(r.reviews)) : 0,
    lapses: finite(r.lapses) ? Math.max(0, Math.floor(r.lapses)) : 0,
    history,
  }
}

/** Valida el almacenamiento completo: descarta lo corrupto sin lanzar nunca. */
export function sanitizePalaces(raw: unknown): Record<string, PalaceMemory> {
  const out: Record<string, PalaceMemory> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, mem] of Object.entries(raw as Record<string, unknown>)) {
    if (!mem || typeof mem !== 'object' || Array.isArray(mem)) continue
    const clean: PalaceMemory = {}
    for (const [id, rec] of Object.entries(mem as Record<string, unknown>)) {
      const c = sanitizeConcept(rec)
      if (c) clean[id] = c
    }
    out[key] = clean
  }
  return out
}

import { LIMITS, PalaceSchema, type Palace } from './schema'

export type InputFormat = 'text' | 'json' | 'csv'

export type ParseResult =
  | { ok: true; palace: Palace; warnings: string[] }
  | { ok: false; error: string }

type DraftConcept = { title: string; detail: string; metaphor?: string }
type DraftRoom = { title: string; concepts: DraftConcept[] }

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// "Título: detalle", "Título - detalle", "Título — detalle"
function splitTitleDetail(line: string): DraftConcept {
  const m = line.match(/^(.+?)\s*(?::|\s[-–—]\s)\s*(.+)$/)
  if (m) return { title: m[1], detail: m[2] }
  return { title: line, detail: '' }
}

function parseText(input: string): DraftRoom[] {
  const rooms: DraftRoom[] = []
  let current: DraftRoom | null = null
  let lastConcept: DraftConcept | null = null
  let lastIndent = 0

  for (const raw of input.split(/\r?\n/)) {
    if (!raw.trim()) continue
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, '  ').length
    const line = raw.trim()
    const bullet = line.match(/^(?:[-*•+]|\d+[.)])\s+(.*)$/)
    const heading = line.match(/^#{1,6}\s+(.*)$/)

    if (heading || (!bullet && indent === 0)) {
      current = { title: (heading ? heading[1] : line).replace(/:$/, ''), concepts: [] }
      rooms.push(current)
      lastConcept = null
      continue
    }
    if (!current) {
      current = { title: 'General', concepts: [] }
      rooms.push(current)
    }
    // Línea más indentada que el concepto anterior y sin viñeta: continúa su detalle.
    if (!bullet && lastConcept && indent > lastIndent) {
      lastConcept.detail = [lastConcept.detail, line].filter(Boolean).join(' ')
      continue
    }
    lastConcept = splitTitleDetail(bullet ? bullet[1] : line)
    lastIndent = indent
    current.concepts.push(lastConcept)
  }

  // Texto plano sin jerarquía: todo va a una sola sala.
  if (rooms.length > 0 && rooms.every((r) => r.concepts.length === 0)) {
    return [{ title: 'Apuntes', concepts: rooms.map((r) => splitTitleDetail(r.title)) }]
  }
  return rooms
}

function conceptFromUnknown(v: unknown, key?: string): DraftConcept | null {
  if (typeof v === 'string') return key ? { title: key, detail: v } : splitTitleDetail(v)
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    const title = o.title ?? o.titulo ?? o.name ?? o.nombre ?? o.concepto ?? key
    if (typeof title !== 'string') return null
    const detail = o.detail ?? o.detalle ?? o.description ?? o.descripcion ?? ''
    const metaphor = o.metaphor ?? o.metafora
    return {
      title,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
      metaphor: typeof metaphor === 'string' ? metaphor : undefined,
    }
  }
  if (key) return { title: key, detail: String(v) }
  return null
}

function conceptsFromUnknown(v: unknown): DraftConcept[] {
  if (Array.isArray(v)) return v.map((x) => conceptFromUnknown(x)).filter((x): x is DraftConcept => !!x)
  if (v && typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => conceptFromUnknown(x, k))
      .filter((x): x is DraftConcept => !!x)
  }
  return []
}

// Acepta el contrato completo y formas sueltas:
// { rooms: [...] }, [{ sala, items }], { "Tema": ["a", "b"] }, { "Tema": { "c": "detalle" } }
function parseJson(input: string): { title?: string; rooms: DraftRoom[] } {
  const data: unknown = JSON.parse(input)
  const roomFrom = (o: Record<string, unknown>, fallback: string): DraftRoom => {
    const title = o.title ?? o.titulo ?? o.sala ?? o.tema ?? o.name ?? o.nombre ?? fallback
    const items = o.concepts ?? o.conceptos ?? o.items ?? o.children ?? []
    return { title: String(title), concepts: conceptsFromUnknown(items) }
  }
  const fromArray = (arr: unknown[]) =>
    arr.map((x, i) =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? roomFrom(x as Record<string, unknown>, `Sala ${i + 1}`)
        : { title: String(x), concepts: [] },
    )

  if (Array.isArray(data)) return { rooms: fromArray(data) }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const list = o.rooms ?? o.salas ?? o.temas
    const title = typeof (o.title ?? o.titulo) === 'string' ? String(o.title ?? o.titulo) : undefined
    if (Array.isArray(list)) return { title, rooms: fromArray(list) }
    return {
      rooms: Object.entries(o).map(([k, v]) => ({ title: k, concepts: conceptsFromUnknown(v) })),
    }
  }
  throw new Error('El JSON debe ser un objeto o un arreglo.')
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

// Columnas: sala, concepto, detalle (opcional), metáfora (opcional).
function parseCsv(input: string): DraftRoom[] {
  const lines = input.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const header = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase())
  const looksLikeHeader = header.some((h) => /sala|tema|room|categor|concept|item|detalle|detail/.test(h))
  const rows = (looksLikeHeader ? lines.slice(1) : lines).map((l) => splitCsvLine(l, sep))
  const byRoom = new Map<string, DraftRoom>()
  for (const [room, concept, detail = '', metaphor] of rows) {
    if (!room || !concept) continue
    if (!byRoom.has(room)) byRoom.set(room, { title: room, concepts: [] })
    byRoom.get(room)!.concepts.push({ title: concept, detail, metaphor: metaphor || undefined })
  }
  return [...byRoom.values()]
}

export function detectFormat(input: string): InputFormat {
  const t = input.trim()
  if (t.startsWith('{') || t.startsWith('[')) return 'json'
  const first = t.split(/\r?\n/, 1)[0] ?? ''
  if (/^[^#\-*•].*[,;].*[,;]?/.test(first) && t.split(/\r?\n/).slice(0, 3).every((l) => /[,;]/.test(l))) return 'csv'
  return 'text'
}

export function parsePalace(input: string, format: InputFormat = detectFormat(input)): ParseResult {
  const warnings: string[] = []
  if (!input.trim()) return { ok: false, error: 'Pega algunos apuntes para empezar.' }
  if (input.length > LIMITS.maxInputChars) {
    return { ok: false, error: `El texto supera ${LIMITS.maxInputChars.toLocaleString('es')} caracteres.` }
  }

  let title: string | undefined
  let rooms: DraftRoom[]
  try {
    if (format === 'json') ({ title, rooms } = parseJson(input))
    else if (format === 'csv') rooms = parseCsv(input)
    else rooms = parseText(input)
  } catch (e) {
    return { ok: false, error: format === 'json' ? `JSON inválido: ${(e as Error).message}` : 'No se pudo leer la entrada.' }
  }

  rooms = rooms.filter((r) => r.title.trim())
  if (rooms.length === 0) return { ok: false, error: 'No encontramos temas ni conceptos.' }
  if (rooms.length > LIMITS.maxRooms) {
    warnings.push(`Solo se usan las primeras ${LIMITS.maxRooms} salas.`)
    rooms = rooms.slice(0, LIMITS.maxRooms)
  }

  const palace = {
    title: clip(title ?? rooms[0].title, LIMITS.maxTitle) || 'Mi palacio',
    rooms: rooms.map((r, ri) => {
      if (r.concepts.length > LIMITS.maxConceptsPerRoom) {
        warnings.push(`"${clip(r.title, 30)}" tiene más de ${LIMITS.maxConceptsPerRoom} conceptos; se recortó.`)
      }
      return {
        id: `r${ri}`,
        title: clip(r.title, LIMITS.maxTitle),
        concepts: r.concepts
          .slice(0, LIMITS.maxConceptsPerRoom)
          .filter((c) => c.title.trim())
          .map((c, ci) => ({
            id: `r${ri}c${ci}`,
            title: clip(c.title, LIMITS.maxTitle),
            detail: clip(c.detail, LIMITS.maxDetail),
            metaphor: c.metaphor ? clip(c.metaphor, LIMITS.maxMetaphor) : undefined,
          })),
      }
    }),
  }

  const parsed = PalaceSchema.safeParse(palace)
  if (!parsed.success) return { ok: false, error: 'La estructura no es válida.' }
  return { ok: true, palace: parsed.data, warnings }
}

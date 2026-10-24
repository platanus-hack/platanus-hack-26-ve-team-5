import { LIMITS, MuseumSchema, type Museum } from '@mus3o/shared'

export const MAX_INPUT_CHARS = 50_000

export type InputFormat = 'text' | 'json' | 'csv'

export type ParseResult =
  | { ok: true; palace: Museum; warnings: string[] }
  | { ok: false; error: string }

type DraftSource = { quote: string; line?: number }
type DraftConcept = { title: string; detail: string; metaphor?: string; source?: DraftSource }
type DraftRoom = { title: string; concepts: DraftConcept[]; source?: DraftSource }

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// Línea original recortada, para mostrar de dónde sale cada concepto (los apuntes siguen siendo del usuario).
const lineSource = (raw: string, lineNo: number): DraftSource => ({ quote: raw.trim().slice(0, LIMITS.maxQuote), line: lineNo })

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

  for (const [i, raw] of input.split(/\r?\n/).entries()) {
    if (!raw.trim()) continue
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, '  ').length
    const line = raw.trim()
    const bullet = line.match(/^(?:[-*•+]|\d+[.)])\s+(.*)$/)
    const heading = line.match(/^#{1,6}\s+(.*)$/)

    if (heading || (!bullet && indent === 0)) {
      current = { title: (heading ? heading[1] : line).replace(/:$/, ''), concepts: [], source: lineSource(raw, i + 1) }
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
    lastConcept = { ...splitTitleDetail(bullet ? bullet[1] : line), source: lineSource(raw, i + 1) }
    lastIndent = indent
    current.concepts.push(lastConcept)
  }

  // Texto plano sin jerarquía: todo va a una sola sala.
  if (rooms.length > 0 && rooms.every((r) => r.concepts.length === 0)) {
    return [{ title: 'Apuntes', concepts: rooms.map((r) => ({ ...splitTitleDetail(r.title), source: r.source })) }]
  }
  return rooms
}

// Solo se acepta la fuente si el JSON ya la trae: nunca se inventa.
function sourceFromUnknown(v: unknown): DraftSource | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const { quote, line } = v as Record<string, unknown>
  if (typeof quote !== 'string' || !quote.trim()) return undefined
  return {
    quote: quote.trim().slice(0, LIMITS.maxQuote),
    line: typeof line === 'number' && Number.isInteger(line) && line >= 1 ? line : undefined,
  }
}

function conceptFromUnknown(v: unknown, key?: string): DraftConcept | null {
  if (typeof v === 'string') return key ? { title: key, detail: v } : splitTitleDetail(v)
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    const title = o.title ?? o.titulo ?? o.name ?? o.nombre ?? o.concepto ?? key
    if (typeof title !== 'string') return null
    const detail = o.detail ?? o.detalle ?? o.text ?? o.description ?? o.descripcion ?? ''
    const metaphor = o.metaphor ?? o.metafora ?? o.fact
    return {
      title,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
      metaphor: typeof metaphor === 'string' ? metaphor : undefined,
      source: sourceFromUnknown(o.source),
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
    const items = o.concepts ?? o.conceptos ?? o.pieces ?? o.items ?? o.children ?? []
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
  // Se conserva el número de línea original (las vacías se saltan pero cuentan).
  const lines = input.split(/\r?\n/).map((text, i) => ({ text, no: i + 1 })).filter((l) => l.text.trim())
  if (lines.length === 0) return []
  const sep = (lines[0].text.match(/;/g)?.length ?? 0) > (lines[0].text.match(/,/g)?.length ?? 0) ? ';' : ','
  const header = splitCsvLine(lines[0].text, sep).map((h) => h.toLowerCase())
  const looksLikeHeader = header.some((h) => /sala|tema|room|categor|concept|item|detalle|detail/.test(h))
  const rows = (looksLikeHeader ? lines.slice(1) : lines).map((l) => ({ cells: splitCsvLine(l.text, sep), l }))
  const byRoom = new Map<string, DraftRoom>()
  for (const { cells: [room, concept, detail = '', metaphor], l } of rows) {
    if (!room || !concept) continue
    if (!byRoom.has(room)) byRoom.set(room, { title: room, concepts: [] })
    byRoom.get(room)!.concepts.push({ title: concept, detail, metaphor: metaphor || undefined, source: lineSource(l.text, l.no) })
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
  if (input.length > MAX_INPUT_CHARS) {
    return { ok: false, error: `El texto supera ${MAX_INPUT_CHARS.toLocaleString('es')} caracteres.` }
  }

  // Un museo completo (p. ej. generado por la IA) se usa tal cual: conserva los modelos 3D.
  if (format === 'json') {
    try {
      const full = MuseumSchema.safeParse(JSON.parse(input))
      if (full.success) return { ok: true, palace: full.data, warnings }
    } catch {
      // Cae al parser tolerante, que reporta el error.
    }
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
      if (r.concepts.length > LIMITS.maxPiecesPerRoom) {
        warnings.push(`"${clip(r.title, 30)}" tiene más de ${LIMITS.maxPiecesPerRoom} conceptos; se recortó.`)
      }
      return {
        id: `r${ri}`,
        name: clip(r.title, LIMITS.maxTitle),
        description: '',
        pieces: r.concepts
          .slice(0, LIMITS.maxPiecesPerRoom)
          .filter((c) => c.title.trim())
          .map((c, ci) => ({
            id: `r${ri}c${ci}`,
            title: clip(c.title, LIMITS.maxTitle),
            text: clip(c.detail, LIMITS.maxText),
            // Sin IA no hay dato curioso; la metáfora (si viene) ocupa ese lugar.
            fact: c.metaphor ? clip(c.metaphor, LIMITS.maxText) : '',
            ...(c.source ? { source: c.source } : {}),
          })),
      }
    }),
  }

  const parsed = MuseumSchema.safeParse(palace)
  if (!parsed.success) return { ok: false, error: 'La estructura no es válida.' }
  return { ok: true, palace: parsed.data, warnings }
}

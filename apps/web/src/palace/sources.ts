import { locateFragment, toNfc, type PieceSource } from '@mus3o/shared'

export type SourceView = {
  line?: number
  /** Línea de los apuntes partida alrededor del fragmento resaltado. */
  pre: string
  mark: string
  post: string
  /** Una línea vecina (no vacía) para dar contexto, si los apuntes guardados coinciden. */
  context?: string
}

const CLIP = 160

/**
 * Prepara lo que muestra la tarjeta: la línea de los apuntes con el fragmento resaltado.
 * Si no hay apuntes guardados (o ya no coinciden con la cita) muestra solo la cita, sin contexto.
 */
export function sourceView(sourceText: string | null | undefined, source: PieceSource): SourceView {
  const fallback = (line?: number): SourceView => ({ line, pre: '', mark: source.quote, post: '' })
  if (!sourceText) return fallback(source.line)

  const text = toNfc(sourceText)
  const lines = text.split('\n')
  // Posición donde empieza la línea indicada: ahí se prefiere la coincidencia.
  const hintLine = source.line && source.line <= lines.length ? source.line : 1
  const lineStart = lines.slice(0, hintLine - 1).reduce((n, l) => n + l.length + 1, 0)
  const hit = locateFragment(text, source.quote, lineStart)
  if (!hit) return fallback(source.line)

  const lineIdx = hit.line - 1
  const raw = lines[lineIdx].replace(/\r$/, '')
  const startOfLine = lines.slice(0, lineIdx).reduce((n, l) => n + l.length + 1, 0)
  const a = hit.start - startOfLine
  const b = Math.min(hit.end - startOfLine, raw.length)

  // Se recorta la línea larga alrededor del fragmento.
  const from = Math.max(0, Math.min(a - 40, raw.length - CLIP))
  const to = Math.min(raw.length, from + CLIP)
  const cut = (s: string, left: boolean, right: boolean) => (left ? '…' : '') + s + (right ? '…' : '')
  const pre = cut(raw.slice(from, a), from > 0, false)
  const mark = raw.slice(a, b)
  const post = cut(raw.slice(b, to), false, to < raw.length)

  const near = (step: 1 | -1) => {
    for (let i = lineIdx + step; i >= 0 && i < lines.length; i += step) {
      if (lines[i].trim()) return lines[i].trim().slice(0, CLIP)
    }
    return undefined
  }
  return { line: hit.line, pre, mark, post, context: near(-1) ?? near(1) }
}

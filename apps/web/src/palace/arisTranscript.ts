/**
 * Normalizador determinista y ligero para transcripciones de audio de Aris:
 * - 0 KB de dependencias. Costo $0.
 * - Elimina muletillas orales ("eh", "este", "bueno", prefijo "Aris").
 * - Corrige variantes fonéticas y modismos hacia las intenciones clave de `arisBrain`.
 * - Acota la longitud máxima para prevenir desbordes.
 */

const LEADING_FILLERS = /^(?:(?:o?ye|mira|hola|che|aris|eh+|este+|em+|um+|bueno|a\s*ver)\b[\s,.:;¡!¿?]*)+/i
const TRAILING_PUNCTUATION = /[\s,.:;¡!¿?]+$/
const MULTI_SPACES = /\s+/g

/** Mapeo determinista de frases orales a formas estándar reconocidas por arisBrain */
const PHRASE_CORRECTIONS: [RegExp, string][] = [
  [/\b(?:a\s+donde|pa\s+donde|hacia\s+donde)\b/gi, 'adónde'],
  [/\b(?:que\s+falta|ke\s+falta)\b/gi, 'qué falta'],
  [/\b(?:como\s+voy|cuanto\s+llevo|cuanto\s+va)\b/gi, 'cómo voy'],
  [/\b(?:de\s+que\s+trata|de\s+k\s+trata)\b/gi, 'de qué trata'],
  [/\b(?:yave|yaves|llaves)\b/gi, 'llave'],
  [/\b(?:puertas|rejas|compuertas)\b/gi, 'puerta'],
  [/\b(?:proximo|siguiente\s+sala)\b/gi, 'siguiente'],
]

/**
 * Normaliza una transcripción en bruto del usuario:
 * 1. Limpieza básica y descarte de prefijos vacíos.
 * 2. Eliminación de muletillas iniciales de voz ("eh este Aris...").
 * 3. Corrección determinista de intenciones y modismos.
 * 4. Truncamiento preventivo (máx. 200 chars).
 */
export function normalizeTranscript(raw: string, maxLen = 200): string {
  if (typeof raw !== 'string') return ''

  let text = raw.trim()
  if (!text) return ''

  // 1. Quitar muletillas orales al inicio
  text = text.replace(LEADING_FILLERS, '').trim()

  // 2. Si el usuario solo dijo "eh" o "Aris", mantener texto si quedó vacío
  if (!text) {
    text = raw.trim()
  }

  // 3. Aplicar correcciones fonéticas y de modismos comunes
  for (const [pattern, replacement] of PHRASE_CORRECTIONS) {
    text = text.replace(pattern, replacement)
  }

  // 4. Limpiar signos de puntuación residuales al final y espacios
  text = text.replace(TRAILING_PUNCTUATION, '').replace(MULTI_SPACES, ' ').trim()

  // 5. Acotar longitud
  return text.slice(0, maxLen)
}

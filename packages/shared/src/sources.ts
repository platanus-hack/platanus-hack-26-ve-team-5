import { LIMITS, type Museum } from "./schema";

/** Proporción mínima de la cita que debe aparecer seguida en los apuntes para darla por verificada. */
export const MIN_FRAGMENT_RATIO = 0.6;
const MIN_FRAGMENT_CHARS = 4;

const QUOTE_CHARS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "´": "'", "`": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "«": '"', "»": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
};
const INVISIBLE = /[​‌‍⁠﻿­]/;

export const toNfc = (text: string) => text.normalize("NFC");

/**
 * Normaliza para comparar (espacios colapsados, comillas y guiones unificados, sin mayúsculas)
 * y recuerda de qué posición del texto original viene cada carácter. `text` debe estar en NFC.
 */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (INVISIBLE.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      norm += " ";
      map.push(pendingSpace);
      pendingSpace = -1;
    }
    const out = (QUOTE_CHARS[ch] ?? ch).toLowerCase();
    for (const c of out) {
      norm += c;
      map.push(i);
    }
  }
  return { norm, map };
}

export type FragmentMatch = {
  /** Posición en `toNfc(text)`. */
  start: number;
  end: number;
  /** Línea 1-based donde empieza. */
  line: number;
  /** true si la cita completa está en el texto; false si solo un fragmento largo. */
  exact: boolean;
};

const lineAt = (text: string, index: number) => {
  let line = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) line++;
  return line;
};

/**
 * Busca `fragment` dentro de `text` ignorando mayúsculas, espacios, comillas y guiones tipográficos.
 * Si la cita completa no está, acepta el fragmento común más largo con al menos el 60 % de la cita.
 * `from` (posición en NFC) hace preferir coincidencias a partir de ahí.
 */
export function locateFragment(text: string, fragment: string, from = 0): FragmentMatch | null {
  const nfc = toNfc(text);
  const hay = normalizeWithMap(nfc);
  const q = normalizeWithMap(toNfc(fragment)).norm.trim();
  if (q.length < MIN_FRAGMENT_CHARS) return null;

  const fromNorm = Math.max(0, hay.map.findIndex((o) => o >= from));
  const find = (needle: string) => {
    const p = hay.norm.indexOf(needle, fromNorm);
    return p !== -1 || fromNorm === 0 ? p : hay.norm.indexOf(needle);
  };
  const done = (a: number, b: number, exact: boolean): FragmentMatch => {
    const start = hay.map[a];
    const end = hay.map[b - 1] + 1;
    return { start, end, line: lineAt(nfc, start), exact };
  };

  const whole = find(q);
  if (whole !== -1) return done(whole, whole + q.length, true);

  // Fragmento común más largo: toda coincidencia de ≥ 60 % contiene alguna ventana de ese tamaño.
  const k = Math.max(MIN_FRAGMENT_CHARS, Math.ceil(q.length * MIN_FRAGMENT_RATIO));
  let best = { len: 0, at: 0 };
  for (let i = 0; i + k <= q.length; i++) {
    const p = find(q.slice(i, i + k));
    if (p === -1) continue;
    let a = 0;
    while (i - a > 0 && p - a > 0 && q[i - a - 1] === hay.norm[p - a - 1]) a++;
    let b = k;
    while (i + b < q.length && p + b < hay.norm.length && q[i + b] === hay.norm[p + b]) b++;
    if (a + b > best.len) best = { len: a + b, at: p - a };
  }
  if (best.len >= k) return done(best.at, best.at + best.len, false);
  return null;
}

export type SourceStats = { total: number; verified: number; unverified: number };

/** Cuenta las piezas con fuente verificada y las marcadas como no encontradas en los apuntes. */
export function countSources(museum: Museum): SourceStats {
  const stats: SourceStats = { total: 0, verified: 0, unverified: 0 };
  for (const room of museum.rooms) {
    for (const piece of room.pieces) {
      stats.total++;
      if (piece.unverified) stats.unverified++;
      else if (piece.source) stats.verified++;
    }
  }
  return stats;
}

/** Una sola línea, sin saltos, recortada al máximo permitido. */
const tidy = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, LIMITS.maxQuote);

/**
 * Comprueba la cita de cada pieza contra los apuntes. La cita guardada es el texto real de los
 * apuntes (no la versión de la IA) y la línea se calcula aquí. Si no se encuentra, se descarta
 * `source` y la pieza queda marcada `unverified`: la IA agregó esa idea.
 */
export function verifySources(museum: Museum, notes: string): { museum: Museum; stats: SourceStats } {
  const text = toNfc(notes);
  const stats: SourceStats = { total: 0, verified: 0, unverified: 0 };
  const rooms = museum.rooms.map((room) => ({
    ...room,
    pieces: room.pieces.map((piece) => {
      stats.total++;
      const { source, unverified: _previous, ...rest } = piece;
      const hit = source?.quote ? locateFragment(text, source.quote) : null;
      if (!hit) {
        stats.unverified++;
        return { ...rest, unverified: true };
      }
      stats.verified++;
      return { ...rest, source: { quote: tidy(text.slice(hit.start, hit.end)), line: hit.line } };
    }),
  }));
  return { museum: { ...museum, rooms }, stats };
}

/** Recorta citas demasiado largas y descarta `line` (la calcula el server) antes de validar con el schema. */
export function sanitizeRawSources(json: unknown): unknown {
  const rooms = (json as { rooms?: unknown } | null)?.rooms;
  if (!Array.isArray(rooms)) return json;
  for (const room of rooms) {
    const pieces = (room as { pieces?: unknown } | null)?.pieces;
    if (!Array.isArray(pieces)) continue;
    for (const piece of pieces as Record<string, unknown>[]) {
      if (!piece || typeof piece !== "object" || !("source" in piece)) continue;
      const src = piece.source as { quote?: unknown; line?: unknown } | null;
      if (!src || typeof src !== "object" || typeof src.quote !== "string" || !src.quote.trim()) {
        delete piece.source;
        continue;
      }
      src.quote = tidy(src.quote);
      delete src.line;
    }
  }
  return json;
}

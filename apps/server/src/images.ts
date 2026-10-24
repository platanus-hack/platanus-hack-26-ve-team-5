import express from "express";
import type { Router } from "express";
import type { ResolvedImage } from "@mus3o/shared";

import {
  readCacheFile,
  readCacheMeta,
  readSeedFile,
  readSeedMeta,
  writeCacheFile,
  writeCacheMeta,
  resetStoreState,
  type StoredFile,
} from "./imageStore";

// Política de Wikimedia: User-Agent identificable con contacto en cada llamada.
const DEFAULT_UA =
  "mus3o/1.0 (https://github.com/platanus-hack/platanus-hack-26-ve-team-5; contact via repo issues)";
const userAgent = () => process.env.WIKIMEDIA_USER_AGENT?.trim() || DEFAULT_UA;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);

/** Error transitorio de Wikimedia (límite de tasa, 5xx, timeout): no debe cachearse como "sin imagen". */
export class UpstreamError extends Error {}

/** Ajustes de espera (milisegundos); las pruebas los reducen. */
export const tuning = { retryAfterCapMs: 5_000, defaultRetryMs: 1_500, backoffMs: 3_000, concurrency: 2 };

/** Telemetría simple: cuántas llamadas reales salieron hacia Wikimedia. */
export const upstreamStats = { calls: 0 };

// Máximo 2 llamadas simultáneas a Wikimedia: entrar a un museo pide decenas de imágenes a la vez.
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= tuning.concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await run();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Tras un 429 se pausan las llamadas nuevas unos segundos en lugar de seguir martillando.
let pausedUntil = 0;
async function respectBackoff() {
  for (let wait = pausedUntil - Date.now(); wait > 0; wait = pausedUntil - Date.now()) await sleep(wait);
}

/** `Retry-After` en segundos o fecha HTTP → milisegundos (null si falta o es ilegible). */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

export const resetBackoff = () => {
  pausedUntil = 0;
};

/**
 * Una llamada a Wikimedia con cortesía: espera la pausa global, usa el User-Agent de la política y,
 * ante un 429, respeta `Retry-After` (máx. ~5 s) y reintenta una sola vez. `handle` consume la respuesta
 * dentro del turno de concurrencia. Lanza UpstreamError si sigue fallando.
 */
async function upstream<T>(url: string, accept: string, handle: (res: Response) => Promise<T>, redirect?: RequestRedirect): Promise<T> {
  return slot(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await respectBackoff();
      let res: Response;
      try {
        upstreamStats.calls++;
        res = await fetch(url, {
          headers: { "User-Agent": userAgent(), Accept: accept },
          redirect,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new UpstreamError("timeout");
      }
      if (res.status === 429) {
        const wait = Math.min(parseRetryAfter(res.headers.get("retry-after")) ?? tuning.defaultRetryMs, tuning.retryAfterCapMs);
        pausedUntil = Math.max(pausedUntil, Date.now() + Math.max(wait, tuning.backoffMs));
        await res.body?.cancel().catch(() => {});
        if (attempt === 0) continue;
        throw new UpstreamError("429");
      }
      return handle(res);
    }
    throw new UpstreamError("429");
  });
}

async function getJson(url: string): Promise<any | null> {
  return upstream(url, "application/json", async (res) => {
    if (res.status === 404) return null;
    if (!res.ok) throw new UpstreamError(String(res.status));
    return res.json();
  });
}

const normalize = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const stripTags = (html: unknown) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function classify(mime: string, name: string, description: string, dateOriginal: string): ResolvedImage["kind"] {
  const text = `${name} ${description}`.toLowerCase();
  if (mime.includes("svg") || /diagram|esquema/.test(text)) return "diagram";
  const year = /\b(\d{4})\b/.exec(dateOriginal)?.[1];
  if ((year && Number(year) < 1930) || /painting|pintura|óleo|oleo/.test(text)) return "painting";
  return "photo";
}

type CommonsPage = { title?: string; index?: number; imageinfo?: any[] };

function toResolved(page: CommonsPage, displayTitle?: string): ResolvedImage | null {
  const info = page.imageinfo?.[0];
  const mime: string = info?.mime ?? "";
  if (!info || !mime.startsWith("image/")) return null;
  const url: string = info.thumburl || info.url;
  if (!url) return null;
  const meta = info.extmetadata ?? {};
  const fileName = (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
  const description = stripTags(meta.ImageDescription?.value);
  const date = stripTags(meta.DateTimeOriginal?.value);
  let artist = stripTags(meta.Artist?.value);
  const half = artist.length / 2;
  if (artist.length % 2 === 0 && artist.slice(0, half) === artist.slice(half)) artist = artist.slice(0, half);
  artist = artist.slice(0, 80);
  const year = /\b(\d{4})\b/.exec(date)?.[1];
  return {
    src: `/api/image/file?u=${encodeURIComponent(url)}`,
    width: info.thumbwidth || info.width || 960,
    height: info.thumbheight || info.height || 640,
    title: (displayTitle || fileName).slice(0, 120),
    artist: [artist, year].filter(Boolean).join(", "),
    license: stripTags(meta.LicenseShortName?.value) || "Ver fuente",
    licenseUrl: meta.LicenseUrl?.value ? String(meta.LicenseUrl.value) : undefined,
    sourceUrl: info.descriptionurl || "https://commons.wikimedia.org",
    kind: classify(mime, fileName, description, date),
  };
}

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const IIPROP = "prop=imageinfo&iiprop=url%7Cextmetadata%7Cmime%7Csize&iiurlwidth=960";

/** Nombre del archivo en una URL de upload: `.../a/ab/X.jpg` o `.../thumb/a/ab/X.jpg/330px-X.jpg`. */
function fileNameOf(source: string): string {
  try {
    const parts = new URL(source).pathname.split("/");
    const name = parts.includes("thumb") ? parts[parts.length - 2] : parts[parts.length - 1];
    return decodeURIComponent(name ?? "");
  } catch {
    return "";
  }
}

async function fromWikipedia(title: string, lang: string): Promise<ResolvedImage | null> {
  const slug = encodeURIComponent(title.trim().replace(/\s+/g, "_"));
  const summary = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`);
  if (!summary || summary.type === "disambiguation") return null;
  const original = summary.originalimage?.source as string | undefined;
  const thumb = summary.thumbnail?.source as string | undefined;
  if (!original && !thumb) return null;

  const file = fileNameOf((original ?? thumb)!);
  if (file) {
    try {
      const data = await getJson(
        `${COMMONS}?action=query&format=json&titles=${encodeURIComponent("File:" + file)}&${IIPROP}`,
      );
      const page = Object.values<CommonsPage>(data?.query?.pages ?? {})[0];
      const resolved = page ? toResolved(page, summary.title) : null;
      if (resolved) return resolved;
    } catch (err) {
      // Si Commons limita la tasa, la miniatura del resumen sirve igual: no se pierde la imagen.
      if (!(err instanceof UpstreamError)) throw err;
    }
  }
  // El archivo no está en Commons (p. ej. subido localmente): usa la miniatura del resumen.
  const url = (thumb ?? original)!;
  const img = summary.thumbnail ?? summary.originalimage;
  return {
    src: `/api/image/file?u=${encodeURIComponent(url)}`,
    width: img.width || 320,
    height: img.height || 240,
    title: String(summary.title ?? title).slice(0, 120),
    artist: "",
    license: "Ver fuente",
    sourceUrl: summary.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org`,
    kind: "photo",
  };
}

async function fromCommons(query: string): Promise<ResolvedImage | null> {
  const data = await getJson(
    `${COMMONS}?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&${IIPROP}`,
  );
  const pages = Object.values<CommonsPage>(data?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const page of pages) {
    const resolved = toResolved(page);
    if (resolved) return resolved;
  }
  return null;
}

const STOP = new Set(
  "a al con de del el en la las lo los por para que se sin sobre su un una y o the of and in on to for".split(" "),
);
const words = (s: string) => normalize(s).replace(/[^a-z0-9ñ]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w));

/** Palabras abstractas que nunca son un artículo con imagen útil ("Fecha", "Consecuencia"...). */
const GENERIC_WORDS = new Set(
  ("fecha consecuencia consecuencias definicion definiciones concepto conceptos causa causas resumen introduccion conclusion " +
    "ejemplo ejemplos funcion funciones tipo tipos etapa etapas importancia caracteristicas resultado resultados " +
    "date definition summary example examples overview cause causes result results type types function").split(" "),
);

/**
 * Título de una sola palabra que no sirve como búsqueda de imagen. `strict`: palabra abstracta conocida
 * (no se busca nada). `weak`: palabra suelta en minúscula (solo vale si un resultado la contiene).
 */
export function genericKind(title: string): "strict" | "weak" | null {
  const t = title.trim();
  if (!t || /\s/.test(t)) return null;
  if (GENERIC_WORDS.has(normalize(t))) return "strict";
  return t[0] === t[0].toLowerCase() && t[0] !== t[0].toUpperCase() ? "weak" : null;
}

/** Búsqueda en Wikipedia: el mejor resultado cuyo título comparte palabras significativas con la consulta. */
async function searchTitles(title: string, context: string, lang: string): Promise<string[]> {
  const q = [title, context].filter(Boolean).join(" ");
  const data = await getJson(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json`,
  );
  const hits: string[] = (data?.query?.search ?? []).map((h: any) => String(h?.title ?? "")).filter(Boolean);
  const own = new Set(words(title));
  const all = new Set([...own, ...words(context)]);
  return hits
    .map((hit, i) => {
      const w = words(hit);
      return { hit, i, mine: w.filter((x) => own.has(x)).length, any: w.filter((x) => all.has(x)).length };
    })
    .filter((h) => h.any > 0)
    .sort((a, b) => b.mine - a.mine || b.any - a.any || a.i - b.i)
    .map((h) => h.hit);
}

const resolveCache = new Map<string, ResolvedImage | null>();
const MAX_RESOLVE_ENTRIES = 500;
// Peticiones iguales que llegan a la vez comparten una sola consulta a Wikimedia. Se limpia al terminar,
// así un error transitorio no queda guardado (igual que antes).
const resolving = new Map<string, Promise<ResolvedImage | null>>();

type ImageQuery = { wiki?: string; commons?: string; lang?: string; context?: string };

function parseQuery(q: ImageQuery) {
  const lang = q.lang && /^[a-z]{2}$/.test(q.lang) ? q.lang : "es";
  const wiki = q.wiki?.trim().slice(0, 120) ?? "";
  const commons = q.commons?.trim().slice(0, 120) ?? "";
  const context = q.context?.trim().slice(0, 120) ?? "";
  return { lang, wiki, commons, context, key: `${lang}|${normalize(wiki)}|${normalize(commons)}|${normalize(context)}` };
}

/** Clave canónica de una consulta (la misma que usan la caché, la semilla y el script de precarga). */
export const queryKey = (q: ImageQuery) => parseQuery(q).key;

/** Orden de búsqueda: memoria → semilla (repo, solo lectura) → caché en disco → Wikimedia. */
export async function resolveImage(q: ImageQuery): Promise<ResolvedImage | null> {
  const { lang, wiki, commons, context, key } = parseQuery(q);
  if (!wiki && !commons) return null;
  if (resolveCache.has(key)) return resolveCache.get(key)!;
  const pending = resolving.get(key);
  if (pending) return pending;

  const task = (async () => {
    let result: ResolvedImage | null | undefined = await readSeedMeta(key);
    if (result === undefined) result = await readCacheMeta(key);
    if (result === undefined) {
      result = await retrieve(wiki, commons, context, lang); // lanza UpstreamError: no se guarda nada
      await writeCacheMeta(key, result); // incluye los "sin imagen" definitivos
    }
    if (resolveCache.size >= MAX_RESOLVE_ENTRIES) resolveCache.delete(resolveCache.keys().next().value!);
    resolveCache.set(key, result);
    return result;
  })();
  resolving.set(key, task);
  try {
    return await task;
  } finally {
    resolving.delete(key);
  }
}

/** Recuperación en cascada: resumen exacto → búsqueda en Wikipedia (con contexto) → búsqueda en Commons. */
async function retrieve(wiki: string, commons: string, context: string, lang: string): Promise<ResolvedImage | null> {
  const generic = wiki ? genericKind(wiki) : null;
  // "Fecha", "Consecuencia"... en un museo de historia: mejor sin cuadro que una imagen cualquiera.
  if (generic === "strict" && !commons) return null;
  if (wiki && generic !== "strict") {
    if (generic !== "weak") {
      const exact = await fromWikipedia(wiki, lang);
      if (exact) return exact;
    }
    if (context || generic === "weak") {
      const own = new Set(words(wiki));
      for (const hit of await searchTitles(wiki, context, lang)) {
        if (generic === "weak" && !words(hit).some((w) => own.has(w))) continue;
        const found = await fromWikipedia(hit, lang);
        if (found) return found;
      }
    }
  }
  if (generic) return commons ? fromCommons(commons) : null;
  // Con la consulta de Commons dada se usa tal cual; sin ella, solo se busca por título + contexto.
  const query = commons || (context ? `${wiki} ${context}` : "");
  return query ? fromCommons(query) : null;
}

// LRU de archivos: 60 entradas / 40 MB.
type FileEntry = StoredFile;
const files = new Map<string, FileEntry>();
let fileBytes = 0;
const MAX_FILES = 60;
const MAX_FILE_BYTES = 40 * 1024 * 1024;

export const clearImageCaches = () => {
  resolveCache.clear();
  resolving.clear();
  loading.clear();
  files.clear();
  fileBytes = 0;
  resetBackoff();
  resetStoreState();
};

function remember(url: string, entry: FileEntry) {
  files.set(url, entry);
  fileBytes += entry.body.length;
  while (files.size > MAX_FILES || fileBytes > MAX_FILE_BYTES) {
    const oldest = files.keys().next().value!;
    fileBytes -= files.get(oldest)!.body.length;
    files.delete(oldest);
  }
}

/** Único control de seguridad del proxy: solo hosts de Wikimedia, sin proxy abierto. */
export function parseAllowedUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

async function readCapped(res: Response): Promise<Buffer | null> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > MAX_BYTES || !res.body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Descargas en curso por URL: varias peticiones iguales comparten una sola descarga. Nunca rechaza:
// devuelve el estado HTTP con el que responder si falla.
const loading = new Map<string, Promise<FileEntry | 413 | 502>>();

async function downloadFile(key: string): Promise<FileEntry | 413 | 502> {
  try {
    const seeded = (await readSeedFile(key)) ?? (await readCacheFile(key));
    if (seeded) {
      remember(key, seeded);
      return seeded;
    }
    const result = await upstream<FileEntry | 413 | 502>(
      key,
      "image/*",
      async (up) => {
        const type = up.headers.get("content-type") ?? "";
        if (!up.ok || !type.startsWith("image/")) return 502;
        const body = await readCapped(up);
        return body ? { body, type } : 413;
      },
      "manual",
    );
    if (typeof result === "number") return result;
    remember(key, result);
    await writeCacheFile(key, result); // solo respuestas buenas; los errores nunca se guardan
    return result;
  } catch {
    return 502;
  }
}

/** Bytes de una imagen de Wikimedia (semilla → caché → red); número = estado HTTP de error. Lo usa el script de precarga. */
export const loadImageFile = (url: string) => downloadFile(url);

export const imageRouter: Router = express.Router();

imageRouter.get("/image", async (req, res) => {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  let image: ResolvedImage | null;
  try {
    image = await resolveImage({ wiki: str(req.query.wiki), commons: str(req.query.commons), lang: str(req.query.lang), context: str(req.query.context) });
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    res.status(502).json({ error: "Wikimedia no disponible" });
    return;
  }
  if (!image) {
    res.status(404).json({ error: "Sin imagen" });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(image);
});

imageRouter.get("/image/file", async (req, res) => {
  const url = parseAllowedUrl(req.query.u);
  if (!url) {
    res.status(400).json({ error: "URL no permitida" });
    return;
  }
  const key = url.toString();
  let entry = files.get(key);
  if (entry) {
    files.delete(key); // refresca el orden LRU
    files.set(key, entry);
  } else {
    let download = loading.get(key);
    if (!download) {
      download = downloadFile(key).finally(() => loading.delete(key));
      loading.set(key, download);
    }
    const result = await download;
    if (typeof result === "number") {
      res.status(result).json({ error: result === 413 ? "Imagen demasiado grande" : "Imagen no disponible" });
      return;
    }
    entry = result;
  }
  res.setHeader("Content-Type", entry.type);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(entry.body);
});

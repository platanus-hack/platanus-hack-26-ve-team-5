import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedImage } from "@mus3o/shared";

/**
 * Almacenes de imágenes en disco:
 *  - semilla (`apps/server/seed/images`, en el repo, solo lectura): lo que la demo necesita sin depender de Wikimedia;
 *  - caché (`IMAGE_CACHE_DIR`, sobrevive a reinicios): metadatos (también "sin imagen") y bytes de imágenes.
 * Las claves son sha256 de la consulta normalizada / de la URL. Nunca se guardan errores transitorios.
 */

export type StoredFile = { body: Buffer; type: string };

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]));
const EXTS = Object.values(EXT_BY_TYPE);

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const baseType = (t: string) => t.split(";")[0].trim().toLowerCase();

const here = dirname(fileURLToPath(import.meta.url));
/** Carpeta de la semilla: junto a `src/` (tsx) o a `dist/` (build), siempre `apps/server/seed/images`. */
export const seedDir = () => (process.env.IMAGE_SEED_DIR ? resolve(process.env.IMAGE_SEED_DIR) : resolve(here, "../seed/images"));
export const cacheDir = () => resolve(process.env.IMAGE_CACHE_DIR || ".cache/images");
const maxCacheBytes = () => Math.max(1, Number(process.env.IMAGE_CACHE_MAX_MB) || 200) * 1024 * 1024;

const metaName = (key: string) => `${sha("meta|" + key)}.json`;
const fileBase = (url: string) => sha("file|" + url);

async function readIf(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

const touch = (path: string) => void utimes(path, new Date(), new Date()).catch(() => {});

/** Metadatos guardados: `undefined` = no se sabe; `null` = sin imagen (definitivo). */
async function readMetaFrom(dir: string, key: string, refresh: boolean): Promise<ResolvedImage | null | undefined> {
  const path = join(dir, metaName(key));
  const raw = await readIf(path);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw.toString("utf8"));
    if (parsed && typeof parsed === "object" && "image" in parsed) {
      if (refresh) touch(path);
      return parsed.image ?? null;
    }
  } catch {
    // Archivo corrupto: se ignora y se vuelve a consultar.
  }
  return undefined;
}

async function readFileFrom(dir: string, url: string, refresh: boolean): Promise<StoredFile | null> {
  const base = fileBase(url);
  for (const ext of EXTS) {
    const path = join(dir, `${base}.${ext}`);
    const body = await readIf(path);
    if (body) {
      if (refresh) touch(path);
      return { body, type: TYPE_BY_EXT[ext] };
    }
  }
  return null;
}

export const readSeedMeta = (key: string) => readMetaFrom(seedDir(), key, false);
export const readSeedFile = (url: string) => readFileFrom(seedDir(), url, false);
export const readCacheMeta = (key: string) => readMetaFrom(cacheDir(), key, true);
export const readCacheFile = (url: string) => readFileFrom(cacheDir(), url, true);

/** Escritura atómica: archivo temporal en la misma carpeta + rename. Un corte nunca deja un archivo a medias. */
export async function atomicWrite(dir: string, name: string, data: Buffer | string): Promise<number> {
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `${name}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, data);
    await rename(tmp, join(dir, name));
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return Buffer.byteLength(data);
}

const metaBody = (image: ResolvedImage | null) => JSON.stringify({ image });
const fileName = (url: string, type: string) => {
  const ext = EXT_BY_TYPE[baseType(type)];
  return ext ? `${fileBase(url)}.${ext}` : null;
};

export async function writeSeedMeta(key: string, image: ResolvedImage | null): Promise<void> {
  await atomicWrite(seedDir(), metaName(key), metaBody(image));
}
export async function writeSeedFile(url: string, file: StoredFile): Promise<boolean> {
  const name = fileName(url, file.type);
  if (!name) return false;
  await atomicWrite(seedDir(), name, file.body);
  return true;
}

// Tamaño aproximado de la caché: se calcula una sola vez, al primer guardado (no al arrancar).
let tracked: { dir: string; bytes: number } | null = null;
let evicting: Promise<void> = Promise.resolve();

async function listCache(dir: string) {
  const out: { path: string; size: number; mtime: number }[] = [];
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const path = join(dir, name);
    try {
      const st = await stat(path);
      if (!st.isFile()) continue;
      if (name.endsWith(".tmp")) {
        if (Date.now() - st.mtimeMs > 3_600_000) await unlink(path).catch(() => {}); // restos de un corte
        continue;
      }
      out.push({ path, size: st.size, mtime: st.mtimeMs });
    } catch {
      // desapareció entre readdir y stat
    }
  }
  return out;
}

/** Borra los más antiguos (por mtime) hasta quedar bajo el tope. Devuelve los bytes que quedan. */
export async function evictCache(dir: string, cap: number): Promise<number> {
  const entries = await listCache(dir);
  let total = entries.reduce((n, e) => n + e.size, 0);
  entries.sort((a, b) => a.mtime - b.mtime);
  for (const e of entries) {
    if (total <= cap) break;
    await unlink(e.path).catch(() => {});
    total -= e.size;
  }
  return total;
}

async function afterWrite(dir: string, added: number) {
  const cap = maxCacheBytes();
  if (!tracked || tracked.dir !== dir) {
    tracked = { dir, bytes: (await listCache(dir)).reduce((n, e) => n + e.size, 0) };
  } else tracked.bytes += added;
  if (tracked.bytes > cap) {
    evicting = evicting.then(async () => {
      tracked = { dir, bytes: await evictCache(dir, cap) };
    });
    await evicting;
  }
}

export async function writeCacheMeta(key: string, image: ResolvedImage | null): Promise<void> {
  try {
    const dir = cacheDir();
    const n = await atomicWrite(dir, metaName(key), metaBody(image));
    await afterWrite(dir, n);
  } catch {
    // La caché es una optimización: si el disco falla, se sirve igual.
  }
}

export async function writeCacheFile(url: string, file: StoredFile): Promise<void> {
  try {
    const name = fileName(url, file.type);
    if (!name) return;
    const dir = cacheDir();
    const n = await atomicWrite(dir, name, file.body);
    await afterWrite(dir, n);
  } catch {
    // ídem
  }
}

/** Para pruebas: olvida el tamaño acumulado. */
export const resetStoreState = () => {
  tracked = null;
  evicting = Promise.resolve();
};

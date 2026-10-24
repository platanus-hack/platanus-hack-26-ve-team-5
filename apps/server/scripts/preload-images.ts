/**
 * Precarga lenta de las imágenes de la demo en la semilla commiteada (`apps/server/seed/images`).
 *
 *   npx tsx apps/server/scripts/preload-images.ts            (desde la raíz)
 *   npx tsx apps/server/scripts/preload-images.ts --force    (vuelve a pedir lo que ya está en la semilla)
 *
 * Secuencial, ~1,5 s entre consultas, respetando 429 (ver images.ts). Es reanudable: lo ya sembrado se salta.
 * Variables: IMAGE_SEED_DIR (destino), IMAGE_PRELOAD_DELAY_MS, IMAGE_PRELOAD_MAX_BYTES (por imagen),
 * IMAGE_PRELOAD_TOTAL_BYTES (tope de la semilla, 8 MB por defecto), WIKIMEDIA_USER_AGENT.
 */
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleMuseum, type ImageSearch, type Museum } from "@mus3o/shared";
import { historiaMuseum } from "../../web/src/mocks/historia";
import { medicinaMuseum } from "../../web/src/mocks/medicina";
import { demoMuseum } from "../../web/src/mocks/index";
import { seedDir, readSeedMeta, writeSeedFile, writeSeedMeta } from "../src/imageStore";
import { UpstreamError, loadImageFile, queryKey, resolveImage } from "../src/images";

// La caché de ejecución va a una carpeta temporal: la única salida persistente es la semilla.
const scratch = mkdtempSync(join(tmpdir(), "mus3o-preload-"));
process.env.IMAGE_CACHE_DIR = scratch;

const DELAY_MS = Number(process.env.IMAGE_PRELOAD_DELAY_MS) || 1_500;
const MAX_FILE = Number(process.env.IMAGE_PRELOAD_MAX_BYTES) || 900 * 1024;
const MAX_TOTAL = Number(process.env.IMAGE_PRELOAD_TOTAL_BYTES) || 8 * 1024 * 1024;
const force = process.argv.includes("--force");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function searchesOf(...museums: Museum[]): { label: string; search: ImageSearch }[] {
  const seen = new Set<string>();
  const out: { label: string; search: ImageSearch }[] = [];
  const add = (label: string, search?: ImageSearch) => {
    if (!search || !(search.wikiTitle?.trim() || search.commonsQuery?.trim())) return;
    const key = JSON.stringify([search.lang ?? "es", search.wikiTitle ?? "", search.commonsQuery ?? "", search.context ?? ""]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, search });
  };
  for (const m of museums) {
    // Cuadros principales de las salas primero, luego las piezas.
    for (const room of m.rooms) add(`${m.title} / ${room.name}`, room.imageSearch);
    for (const room of m.rooms) for (const p of room.pieces) add(`${m.title} / ${p.title}`, p.imageSearch);
  }
  return out;
}

const dirBytes = () => {
  try {
    return readdirSync(seedDir()).reduce((n, f) => n + statSync(join(seedDir(), f)).size, 0);
  } catch {
    return 0;
  }
};

async function main() {
  const entries = searchesOf(historiaMuseum, medicinaMuseum, sampleMuseum, demoMuseum);
  console.log(`Semilla: ${seedDir()}\n${entries.length} consultas, ${DELAY_MS} ms entre cada una.`);
  const missing: string[] = [];
  let ok = 0;
  let skipped = 0;
  let first = true;

  for (const { label, search } of entries) {
    const q = { wiki: search.wikiTitle, commons: search.commonsQuery, lang: search.lang, context: search.context };
    if (!force && (await readSeedMeta(queryKey(q))) !== undefined) {
      skipped++;
      console.log(`= ${label} (ya en la semilla)`);
      continue;
    }
    if (!first) await sleep(DELAY_MS);
    first = false;

    let result: Awaited<ReturnType<typeof resolveImage>> | undefined;
    try {
      result = await resolveImage(q);
    } catch (err) {
      if (!(err instanceof UpstreamError)) throw err;
      console.log(`! ${label}: Wikimedia no disponible (${err.message}); se reintentará al volver a ejecutar`);
      missing.push(`${label} (error transitorio)`);
      continue;
    }
    if (!result) {
      console.log(`- ${label}: sin imagen en Wikimedia`);
      missing.push(`${label} (sin imagen)`);
      continue;
    }
    await sleep(DELAY_MS / 2);
    let url = decodeURIComponent(new URL(result.src, "http://x").searchParams.get("u") ?? "");
    let file = await loadImageFile(url);
    // Pinturas en PNG pesan MB a 960 px: se prueba con miniaturas más angostas (Wikimedia solo sirve anchos estándar).
    for (const w of [500, 330, 250]) {
      if (typeof file === "number" || file.body.length <= MAX_FILE) break;
      const narrower = url.replace(/\/\d+px-([^/]+)$/, `/${w}px-$1`);
      if (narrower === url) break;
      await sleep(DELAY_MS);
      const smaller = await loadImageFile(narrower);
      if (typeof smaller === "number") break;
      result = { ...result, src: `/api/image/file?u=${encodeURIComponent(narrower)}`, height: Math.round((result.height * w) / result.width), width: w };
      url = narrower;
      file = smaller;
    }
    if (typeof file === "number") {
      console.log(`! ${label}: descarga fallida (${file})`);
      missing.push(`${label} (descarga ${file})`);
      continue;
    }
    if (file.body.length > MAX_FILE || dirBytes() + file.body.length > MAX_TOTAL) {
      console.log(`~ ${label}: omitida por tamaño (${Math.round(file.body.length / 1024)} KB)`);
      missing.push(`${label} (demasiado grande)`);
      continue;
    }
    if (!(await writeSeedFile(url, file))) {
      missing.push(`${label} (tipo ${file.type})`);
      continue;
    }
    await writeSeedMeta(queryKey(q), result);
    ok++;
    console.log(`+ ${label}: ${result.title} (${Math.round(file.body.length / 1024)} KB, ${file.type})`);
  }

  console.log(`\nListo: ${ok} nuevas, ${skipped} ya estaban, ${missing.length} sin sembrar. Semilla: ${Math.round(dirBytes() / 1024)} KB.`);
  for (const m of missing) console.log(`  faltó: ${m}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => rmSync(scratch, { recursive: true, force: true }));

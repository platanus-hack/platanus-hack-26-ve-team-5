import { afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Las pruebas nunca leen ni escriben la caché real ni la semilla del repo (cada archivo de prueba, su propia carpeta).
const dir = mkdtempSync(join(tmpdir(), "mus3o-test-"));
process.env.IMAGE_CACHE_DIR = join(dir, "cache");
process.env.IMAGE_SEED_DIR = join(dir, "seed");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

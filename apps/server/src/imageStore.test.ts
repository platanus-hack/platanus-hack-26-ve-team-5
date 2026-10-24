import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedImage } from "@mus3o/shared";
import { atomicWrite, evictCache, writeCacheFile, writeSeedFile, writeSeedMeta } from "./imageStore";
import { clearImageCaches, loadImageFile, parseRetryAfter, queryKey, resolveImage, tuning, UpstreamError } from "./images";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const FILE = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Roma.jpg";
const summary = () => json({ type: "standard", title: "Roma", thumbnail: { source: FILE, width: 300, height: 200 } });
const notInCommons = () => json({ query: { pages: {} } });
const wikiHandler = (url: string) => (url.includes("rest_v1") ? summary() : notInCommons());

const image = (title: string): ResolvedImage => ({
  src: "/api/image/file?u=" + encodeURIComponent(FILE),
  width: 960,
  height: 600,
  title,
  artist: "",
  license: "Public domain",
  sourceUrl: "https://commons.wikimedia.org",
  kind: "painting",
});

let tmp: string;
let calls: { url: string; headers: Record<string, string> }[];
let handler: (url: string) => Response | Promise<Response>;
const original = { ...tuning };

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "mus3o-store-"));
  process.env.IMAGE_CACHE_DIR = join(tmp, "cache");
  process.env.IMAGE_SEED_DIR = join(tmp, "seed");
  delete process.env.WIKIMEDIA_USER_AGENT;
  Object.assign(tuning, original, { backoffMs: 40, retryAfterCapMs: 5_000, defaultRetryMs: 10 });
  clearImageCaches();
  calls = [];
  vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    return Promise.resolve(handler(String(input)));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.IMAGE_CACHE_MAX_MB;
  rmSync(tmp, { recursive: true, force: true });
});

const cacheFiles = () => (existsSync(join(tmp, "cache")) ? readdirSync(join(tmp, "cache")) : []);

describe("disk cache", () => {
  it("serves a repeat from disk after a restart without touching the network", async () => {
    handler = wikiHandler;
    const first = await resolveImage({ wiki: "Roma" });
    expect(first?.title).toBe("Roma");
    const used = calls.length;
    clearImageCaches(); // "reinicio": se pierde la memoria, queda el disco
    const again = await resolveImage({ wiki: " ROMA " });
    expect(again).toEqual(first);
    expect(calls.length).toBe(used);
  });

  it("remembers definitive misses on disk", async () => {
    handler = (url) => (url.includes("wikipedia.org") ? json({}, 404) : notInCommons());
    expect(await resolveImage({ wiki: "Nada", commons: "nada" })).toBeNull();
    const used = calls.length;
    clearImageCaches();
    expect(await resolveImage({ wiki: "Nada", commons: "nada" })).toBeNull();
    expect(calls.length).toBe(used);
  });

  it("never stores transient errors", async () => {
    handler = () => json({}, 500);
    await expect(resolveImage({ wiki: "Roma" })).rejects.toBeInstanceOf(UpstreamError);
    expect(cacheFiles()).toEqual([]);
    handler = wikiHandler;
    expect((await resolveImage({ wiki: "Roma" }))?.title).toBe("Roma");
  });

  it("caches downloaded image bytes and serves them from disk later", async () => {
    handler = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    const a = await loadImageFile(FILE);
    expect(typeof a).not.toBe("number");
    expect(cacheFiles().some((f) => f.endsWith(".jpg"))).toBe(true);
    const used = calls.length;
    clearImageCaches();
    const b = await loadImageFile(FILE);
    expect(b).toMatchObject({ type: "image/jpeg" });
    expect(calls.length).toBe(used);
  });

  it("does not store failed downloads", async () => {
    handler = () => new Response("nope", { status: 500 });
    expect(await loadImageFile(FILE)).toBe(502);
    handler = () => new Response("<html>", { headers: { "Content-Type": "text/html" } });
    expect(await loadImageFile(FILE)).toBe(502);
    expect(cacheFiles()).toEqual([]);
  });

  it("evicts the oldest files by mtime when over the size cap", async () => {
    const dir = join(tmp, "evict");
    mkdirSync(dir);
    for (const [i, name] of ["a.jpg", "b.jpg", "c.jpg"].entries()) {
      writeFileSync(join(dir, name), Buffer.alloc(100));
      utimesSync(join(dir, name), new Date(1_000 * (i + 1)), new Date(1_000 * (i + 1)));
    }
    const left = await evictCache(dir, 250);
    expect(left).toBe(200);
    expect(readdirSync(dir).sort()).toEqual(["b.jpg", "c.jpg"]);
  });

  it("applies the cap on writes (IMAGE_CACHE_MAX_MB)", async () => {
    process.env.IMAGE_CACHE_MAX_MB = "1";
    const big = Buffer.alloc(600 * 1024);
    await writeCacheFile("https://upload.wikimedia.org/1.jpg", { body: big, type: "image/jpeg" });
    await new Promise((r) => setTimeout(r, 20));
    await writeCacheFile("https://upload.wikimedia.org/2.jpg", { body: big, type: "image/jpeg" });
    expect(cacheFiles().filter((f) => f.endsWith(".jpg"))).toHaveLength(1);
  });

  it("leaves no partial or temporary files when a write fails", async () => {
    const dir = join(tmp, "atomic");
    await atomicWrite(dir, "ok.json", "{}");
    expect(readdirSync(dir)).toEqual(["ok.json"]);
    // El destino es una carpeta: rename falla y el temporal se borra.
    mkdirSync(join(dir, "taken"));
    await expect(atomicWrite(dir, "taken", "x")).rejects.toThrow();
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual(["ok.json", "taken"]);
  });
});

describe("seed", () => {
  it("is served first, read-only, with no network and no disk-cache writes", async () => {
    const q = { wiki: "Roma", lang: "es" };
    await writeSeedMeta(queryKey(q), image("De la semilla"));
    await writeSeedFile(FILE, { body: Buffer.from([9, 9]), type: "image/jpeg" });
    handler = () => {
      throw new Error("no debería salir a la red");
    };
    expect((await resolveImage(q))?.title).toBe("De la semilla");
    const file = await loadImageFile(FILE);
    expect(file).toMatchObject({ type: "image/jpeg" });
    expect(calls).toHaveLength(0);
    expect(cacheFiles()).toEqual([]);
  });

  it("wins over the disk cache", async () => {
    handler = wikiHandler;
    await resolveImage({ wiki: "Roma" }); // llena la caché con "Roma"
    clearImageCaches();
    await writeSeedMeta(queryKey({ wiki: "Roma" }), image("Semilla"));
    expect((await resolveImage({ wiki: "Roma" }))?.title).toBe("Semilla");
  });
});

describe("Wikimedia etiquette", () => {
  it("sends the policy User-Agent, overridable by env", async () => {
    handler = wikiHandler;
    await resolveImage({ wiki: "Roma" });
    expect(calls[0].headers["User-Agent"]).toMatch(/^mus3o\/1\.0 \(https:\/\/github\.com\/platanus-hack\/platanus-hack-26-ve-team-5; contact via repo issues\)$/);
    clearImageCaches();
    process.env.WIKIMEDIA_USER_AGENT = "custom/2 (me@example.com)";
    calls.length = 0;
    await resolveImage({ wiki: "Otra" });
    expect(calls[0].headers["User-Agent"]).toBe("custom/2 (me@example.com)");
  });

  it("parses Retry-After as seconds or date and ignores garbage", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter(new Date(Date.now() + 3_000).toUTCString())).toBeGreaterThan(1_000);
  });

  it("waits Retry-After once after a 429 then succeeds", async () => {
    tuning.backoffMs = 0;
    let n = 0;
    handler = (url) => (n++ === 0 ? new Response("slow down", { status: 429, headers: { "Retry-After": "0.15" } }) : wikiHandler(url));
    const t0 = Date.now();
    expect((await resolveImage({ wiki: "Roma" }))?.title).toBe("Roma");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(130);
    expect(calls.filter((c) => c.url.includes("rest_v1"))).toHaveLength(2);
  });

  it("caps an enormous Retry-After", async () => {
    tuning.retryAfterCapMs = 60;
    tuning.backoffMs = 0;
    let n = 0;
    handler = (url) => (n++ === 0 ? new Response("", { status: 429, headers: { "Retry-After": "3600" } }) : wikiHandler(url));
    const t0 = Date.now();
    await resolveImage({ wiki: "Roma" });
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  it("gives up with a transient error (not cached) when 429 persists", async () => {
    handler = () => new Response("", { status: 429, headers: { "Retry-After": "0" } });
    await expect(resolveImage({ wiki: "Roma" })).rejects.toBeInstanceOf(UpstreamError);
    expect(calls).toHaveLength(2); // un solo reintento
    expect(cacheFiles()).toEqual([]);
  });

  it("pauses new upstream calls globally after a 429", async () => {
    tuning.backoffMs = 150;
    let first = true;
    const times: number[] = [];
    handler = (url) => {
      times.push(Date.now());
      if (first) {
        first = false;
        return new Response("", { status: 429, headers: { "Retry-After": "0" } });
      }
      return wikiHandler(url);
    };
    await Promise.all([resolveImage({ wiki: "Roma" }), resolveImage({ wiki: "Paris" })]);
    // La segunda consulta, que no recibió el 429, también espera la pausa común.
    const afterBackoff = times.slice(1);
    expect(afterBackoff.every((t) => t - times[0] >= 130)).toBe(true);
  });

  it("limits concurrent upstream calls to 2", async () => {
    let active = 0;
    let peak = 0;
    handler = async (url) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 30));
      active--;
      return url.includes("rest_v1") ? json({}, 404) : notInCommons();
    };
    await Promise.all(["a", "b", "c", "d", "e"].map((w) => resolveImage({ wiki: "Tema " + w })));
    expect(peak).toBe(2);
  });
});

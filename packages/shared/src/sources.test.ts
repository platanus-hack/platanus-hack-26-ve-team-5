import { describe, expect, it } from "vitest";
import { sampleMuseum } from "./mock";
import { MuseumSchema, type Museum } from "./schema";
import { locateFragment, sanitizeRawSources, verifySources } from "./sources";

const NOTES = [
  "# Transporte",
  "Difusión simple: pasa a favor del gradiente sin gastar energía",
  "Transporte activo: mueve sustancias contra gradiente gastando ATP",
  "",
  "Osmosis — agua que cruza la membrana",
].join("\n");

const museumWith = (sources: ({ quote: string; line?: number } | undefined)[]): Museum => ({
  ...sampleMuseum,
  rooms: [
    {
      ...sampleMuseum.rooms[0],
      pieces: sources.map((source, i) => ({ ...sampleMuseum.rooms[0].pieces[0], id: `p${i}`, source })),
    },
  ],
});

const verify = (quote: string | undefined, notes = NOTES) => {
  const { museum, stats } = verifySources(museumWith([quote === undefined ? undefined : { quote }]), notes);
  return { piece: museum.rooms[0].pieces[0], stats };
};

describe("schema: source traceability fields", () => {
  const withPiece = (extra: Record<string, unknown>) => ({
    ...sampleMuseum,
    rooms: [{ ...sampleMuseum.rooms[0], pieces: [{ ...sampleMuseum.rooms[0].pieces[0], ...extra }] }],
  });

  it("stays valid without source, unverified or sourceTextHash", () => {
    expect(MuseumSchema.safeParse(sampleMuseum).success).toBe(true);
  });

  it("accepts source with and without line, unverified and a hash", () => {
    expect(MuseumSchema.safeParse(withPiece({ source: { quote: "texto", line: 14 } })).success).toBe(true);
    expect(MuseumSchema.safeParse(withPiece({ source: { quote: "texto" }, unverified: false })).success).toBe(true);
    expect(MuseumSchema.safeParse({ ...withPiece({ unverified: true }), sourceTextHash: "a".repeat(64) }).success).toBe(true);
  });

  it("rejects a quote over 240 chars, an empty quote, a bad line and a bad hash", () => {
    expect(MuseumSchema.safeParse(withPiece({ source: { quote: "x".repeat(241) } })).success).toBe(false);
    expect(MuseumSchema.safeParse(withPiece({ source: { quote: "" } })).success).toBe(false);
    expect(MuseumSchema.safeParse(withPiece({ source: { quote: "a", line: 0 } })).success).toBe(false);
    expect(MuseumSchema.safeParse(withPiece({ source: { quote: "a", line: 1.5 } })).success).toBe(false);
    expect(MuseumSchema.safeParse({ ...sampleMuseum, sourceTextHash: "xyz" }).success).toBe(false);
  });
});

describe("verifySources", () => {
  it("accepts an exact quote and computes the line server-side", () => {
    const { piece, stats } = verify("mueve sustancias contra gradiente gastando ATP");
    expect(piece.source).toEqual({ quote: "mueve sustancias contra gradiente gastando ATP", line: 3 });
    expect(piece.unverified).toBeUndefined();
    expect(stats).toEqual({ total: 1, verified: 1, unverified: 0 });
  });

  it("ignores the line the model claims", () => {
    const m = museumWith([{ quote: "agua que cruza la membrana", line: 99 }]);
    expect(verifySources(m, NOTES).museum.rooms[0].pieces[0].source?.line).toBe(5);
  });

  it("accepts a quote that differs in whitespace, case and dashes", () => {
    const { piece } = verify("  OSMOSIS   –\n agua  que cruza la   membrana ");
    expect(piece.source).toEqual({ quote: "Osmosis — agua que cruza la membrana", line: 5 });
    expect(piece.unverified).toBeUndefined();
  });

  it("stores the real text of the notes, not the model's version", () => {
    expect(verify("TRANSPORTE ACTIVO").piece.source?.quote).toBe("Transporte activo");
  });

  it("accepts a quote spanning two lines and reports the first line", () => {
    const { piece } = verify("sin gastar energía\nTransporte activo: mueve");
    expect(piece.source).toEqual({ quote: "sin gastar energía Transporte activo: mueve", line: 2 });
  });

  it("falls back to the longest common fragment when it covers 60% or more", () => {
    const { piece, stats } = verify("Transporte activo: mueve sustancias contra gradiente usando ATP celular");
    expect(piece.source?.line).toBe(3);
    expect(piece.source?.quote).toBe("Transporte activo: mueve sustancias contra gradiente");
    expect(stats.verified).toBe(1);
  });

  it("drops a paraphrased quote and marks the piece unverified", () => {
    const { piece, stats } = verify("Las proteínas bombean moléculas hacia afuera usando combustible celular");
    expect(piece.source).toBeUndefined();
    expect(piece.unverified).toBe(true);
    expect(stats).toEqual({ total: 1, verified: 0, unverified: 1 });
  });

  it("marks a piece without source as unverified", () => {
    const { piece } = verify(undefined);
    expect(piece.unverified).toBe(true);
    expect(piece).not.toHaveProperty("source");
  });

  it("clears a stale unverified flag when the quote verifies", () => {
    const m = museumWith([{ quote: "Osmosis" }]);
    m.rooms[0].pieces[0].unverified = true;
    expect(verifySources(m, NOTES).museum.rooms[0].pieces[0].unverified).toBeUndefined();
  });

  it("counts a mixed museum and keeps the result schema-valid", () => {
    const m = museumWith([{ quote: "Difusión simple" }, { quote: "algo inventado que no está en los apuntes" }, undefined]);
    const { museum, stats } = verifySources(m, NOTES);
    expect(stats).toEqual({ total: 3, verified: 1, unverified: 2 });
    expect(MuseumSchema.safeParse(museum).success).toBe(true);
  });

  it("clips the stored quote to 240 characters", () => {
    const long = "palabra ".repeat(60).trim();
    const { piece } = verify(long.slice(0, 300), long);
    expect(piece.source!.quote.length).toBeLessThanOrEqual(240);
  });

  it("matches across Unicode normalization forms", () => {
    const { piece } = verify("Difusión simple");
    expect(piece.source?.line).toBe(2);
  });

  it("rejects trivially short quotes", () => {
    expect(verify("a").piece.unverified).toBe(true);
  });
});

describe("locateFragment", () => {
  it("prefers the occurrence at or after `from`", () => {
    const text = "alfa beta\nalfa gamma";
    expect(locateFragment(text, "alfa")?.line).toBe(1);
    expect(locateFragment(text, "alfa", 10)?.line).toBe(2);
  });
});

describe("sanitizeRawSources", () => {
  it("clips long quotes, removes the model's line and drops malformed sources", () => {
    const raw = {
      rooms: [{ pieces: [{ source: { quote: "x".repeat(500), line: 7 } }, { source: "texto" }, { source: { quote: "  " } }, {}] }],
    };
    sanitizeRawSources(raw);
    const [a, b, c, d] = raw.rooms[0].pieces as { source?: { quote: string; line?: number } }[];
    expect(a.source!.quote).toHaveLength(240);
    expect(a.source).not.toHaveProperty("line");
    expect(b).not.toHaveProperty("source");
    expect(c).not.toHaveProperty("source");
    expect(d).not.toHaveProperty("source");
  });
});

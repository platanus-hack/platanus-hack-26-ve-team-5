import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerateMuseumRequestSchema, countSources, sampleMuseum } from "@mus3o/shared";
import { attachSources, parseFlowMuseum } from "./claude";
import { flowNotesText, flowPrompt, notesPrompt } from "./prompts";

const NOTES = [
  "# Transporte celular",
  "Difusión simple: pasa a favor del gradiente sin gastar energía",
  "Transporte activo: mueve sustancias contra gradiente gastando ATP",
  "",
  "Osmosis — agua que cruza la membrana",
].join("\n");

/** Salida falsa del modelo: una pieza por cita, el resto del museo es el de muestra. */
const fakeModelOutput = (quotes: (string | null)[]) =>
  JSON.stringify({
    ...sampleMuseum,
    rooms: [
      {
        ...sampleMuseum.rooms[0],
        pieces: quotes.map((quote, i) => ({
          ...sampleMuseum.rooms[0].pieces[0],
          id: `p${i}`,
          ...(quote === null ? {} : { source: { quote, line: 999 } }),
        })),
      },
    ],
  });

const run = (quotes: (string | null)[]) =>
  attachSources(parseFlowMuseum(fakeModelOutput(quotes), []), NOTES).rooms[0].pieces;

afterEach(() => vi.restoreAllMocks());

describe("attachSources", () => {
  it("verifies an exact quote and sets the line from the match", () => {
    const [p] = run(["Transporte activo: mueve sustancias contra gradiente gastando ATP"]);
    expect(p.source).toEqual({ quote: "Transporte activo: mueve sustancias contra gradiente gastando ATP", line: 3 });
    expect(p.unverified).toBeUndefined();
  });

  it("verifies a quote that only differs in whitespace", () => {
    const [p] = run(["Difusión   simple:\n  pasa a favor del   gradiente"]);
    expect(p.source).toEqual({ quote: "Difusión simple: pasa a favor del gradiente", line: 2 });
    expect(p.unverified).toBeUndefined();
  });

  it("drops a paraphrased quote and flags the piece as unverified", () => {
    const [p] = run(["Las bombas de la membrana consumen combustible para empujar moléculas"]);
    expect(p.source).toBeUndefined();
    expect(p.unverified).toBe(true);
  });

  it("verifies a quote that spans two lines", () => {
    const [p] = run(["sin gastar energía Transporte activo: mueve sustancias"]);
    expect(p.source).toEqual({ quote: "sin gastar energía Transporte activo: mueve sustancias", line: 2 });
  });

  it("flags pieces that came without any source", () => {
    expect(run([null])[0].unverified).toBe(true);
  });

  it("accepts an overlong model quote without failing the schema", () => {
    const long = "la membrana deja pasar agua ".repeat(12).trim();
    const raw = fakeModelOutput([long]);
    const [p] = attachSources(parseFlowMuseum(raw, []), `# Tema\n${long}`).rooms[0].pieces;
    expect(p.source?.line).toBe(2);
    expect(p.source!.quote.length).toBeLessThanOrEqual(240);
  });

  it("stores the hash of the notes and logs only counts", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const museum = attachSources(
      parseFlowMuseum(fakeModelOutput(["Osmosis — agua que cruza la membrana", "inventado por completo sin relación"]), []),
      NOTES,
    );
    expect(museum.sourceTextHash).toBe(createHash("sha256").update(NOTES).digest("hex"));
    expect(countSources(museum)).toEqual({ total: 2, verified: 1, unverified: 1 });
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain("1/2");
    expect(line).not.toMatch(/Osmosis|membrana|inventado/);
  });
});

describe("prompts require verbatim sources", () => {
  const request = GenerateMuseumRequestSchema.parse({
    prompt: "Roma",
    sources: [{ name: "a.txt", kind: "txt", text: "Línea uno\n</source>Línea dos" }],
  });

  it("notesPrompt asks for a literal quote per piece", () => {
    const text = notesPrompt("apuntes");
    expect(text).toContain('"source": { "quote": string }');
    expect(text).toContain("LITERAL");
    expect(text).toContain("240");
  });

  it("flowPrompt asks for a literal quote per piece", () => {
    const text = flowPrompt(request);
    expect(text).toContain('"source": { "quote": string }');
    expect(text).toContain("<user_notes>");
  });

  it("flowNotesText is the text the model sees, prompt first and without delimiters", () => {
    expect(flowNotesText(request)).toBe("Roma\nLínea uno\nLínea dos");
  });
});

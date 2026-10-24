import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "color hex inválido");
// Coordenadas y medidas acotadas: el modelo viene de la IA y no debe poder colgar el navegador.
const coord = z.number().finite().min(-5).max(5);
const vec3 = z.tuple([coord, coord, coord]);
const rot3 = z.tuple([
  z.number().finite().min(-7).max(7),
  z.number().finite().min(-7).max(7),
  z.number().finite().min(-7).max(7),
]);

/** Límites de contenido compartidos por el server, los parsers y el layout. */
export const LIMITS = {
  maxNotesChars: 20_000,
  maxRooms: 8,
  maxPiecesPerRoom: 12,
  maxTitle: 80,
  maxText: 400,
  maxImages: 6,
  maxQuote: 240,
} as const;

export const MuseumModeSchema = z.enum(["exploration", "quiz", "biography", "education"]);

export const PartSchema = z.object({
  shape: z.enum(["box", "cylinder", "sphere", "cone"]),
  // Medidas en metros (≤ 4) o número de segmentos (≤ 32); se vuelve a acotar al renderizar.
  args: z.array(z.number().finite().min(0).max(32)).max(8).default([]),
  pos: vec3.default([0, 0, 0]),
  rot: rot3.default([0, 0, 0]),
  color: hex,
});

/** Forma geométrica simple: la usan los apuntes parseados en el cliente, sin IA. */
export const GlyphShape = z.enum(["icosahedron", "octahedron", "dodecahedron", "tetrahedron", "torus", "cone", "box", "sphere"]);

export const ModelSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("catalog"), id: z.string().min(1) }),
  z.object({ type: z.literal("procedural"), parts: z.array(PartSchema).min(1).max(40) }),
  z.object({ type: z.literal("glyph"), shape: GlyphShape }),
]);

export const QuizSchema = z.object({
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(100)).min(2).max(4),
  answerIndex: z.number().int().min(0).max(3),
});

/** Pista para buscar una imagen de dominio público (Wikipedia / Wikimedia Commons). */
export const ImageSearchSchema = z.object({
  /** Título exacto del artículo de Wikipedia en el idioma de los apuntes. */
  wikiTitle: z.string().max(120).optional(),
  /** 2 a 4 palabras clave en inglés para buscar en Commons. */
  commonsQuery: z.string().max(120).optional(),
  lang: z.string().regex(/^[a-z]{2}$/).optional(),
});

/** Respuesta de GET /api/image. */
export const ResolvedImageSchema = z.object({
  src: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  title: z.string(),
  artist: z.string(),
  license: z.string(),
  licenseUrl: z.string().optional(),
  sourceUrl: z.string(),
  kind: z.enum(["painting", "diagram", "photo"]),
});

/** Dónde, en los apuntes del usuario, aparece la idea de una pieza. */
export const PieceSourceSchema = z.object({
  /** Fragmento copiado de los apuntes (≤ 240 caracteres). */
  quote: z.string().min(1).max(LIMITS.maxQuote),
  /** Línea 1-based donde empieza el fragmento. */
  line: z.number().int().min(1).optional(),
});

export const PieceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(LIMITS.maxTitle),
  text: z.string().max(LIMITS.maxText),
  fact: z.string().max(LIMITS.maxText).default(""),
  /** Opcional: el layout procedural del frontend decide la ubicación final. */
  position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]).optional(),
  model: ModelSchema.optional(),
  /** Imagen subida por el usuario que la IA asignó a este cuadro. */
  image: z.object({ imageId: z.string().min(1) }).optional(),
  /** Obligatorio en modo quiz. */
  quiz: QuizSchema.optional(),
  /** Búsqueda de una imagen real para colgarla como cuadro. */
  imageSearch: ImageSearchSchema.optional(),
  /** Trazabilidad: de qué parte de los apuntes sale esta pieza. */
  source: PieceSourceSchema.optional(),
  /** true si la IA agregó esta idea y no se encontró en los apuntes. */
  unverified: z.boolean().optional(),
});

export const RoomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(LIMITS.maxTitle),
  description: z.string().max(LIMITS.maxText).default(""),
  pieces: z.array(PieceSchema).max(LIMITS.maxPiecesPerRoom),
  /** Obligatorio en modo biography, por ejemplo "1879–1905". */
  period: z.string().min(1).max(40).optional(),
  /** Cuadro principal de la sala. */
  imageSearch: ImageSearchSchema.optional(),
});

export const GraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(["next", "prerequisite", "related"]),
});

export const MuseumGraphSchema = z.object({
  /** Sala donde aparece el jugador. */
  start: z.string().min(1),
  edges: z.array(GraphEdgeSchema).max(16),
});

const MuseumObjectSchema = z.object({
  title: z.string().min(1).max(LIMITS.maxTitle),
  theme: z
    .object({
      palette: z.array(hex).min(2).max(8),
      ambience: z.string(),
    })
    .optional(),
  rooms: z.array(RoomSchema).min(1).max(LIMITS.maxRooms),
  mode: MuseumModeSchema.optional(),
  /** Si falta, el frontend recorre las salas en el orden de `rooms`. */
  graph: MuseumGraphSchema.optional(),
  /** SHA-256 (hex) de los apuntes contra los que se verificaron las fuentes. */
  sourceTextHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

type MuseumShape = z.infer<typeof MuseumObjectSchema>;
type MuseumGraph = z.infer<typeof MuseumGraphSchema>;

const linearPathMessage = (mode: string) =>
  `modo ${mode}: las aristas next deben formar un único camino desde graph.start que recorra todas las salas`;

function neighbours(graph: MuseumGraph): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { from, to } of graph.edges) {
    map.set(from, [...(map.get(from) ?? []), to]);
    map.set(to, [...(map.get(to) ?? []), from]);
  }
  return map;
}

function reachableFrom(graph: MuseumGraph): Set<string> {
  const links = neighbours(graph);
  const seen = new Set([graph.start]);
  const queue = [graph.start];
  while (queue.length > 0) {
    for (const next of links.get(queue.shift()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Las aristas `next` forman un solo camino que empieza en `start` y pasa por todas las salas. */
function isNextPathCoveringAll(graph: MuseumGraph, roomIds: string[]): boolean {
  const nextEdges = graph.edges.filter((e) => e.kind === "next");
  if (nextEdges.length !== roomIds.length - 1) return false;
  const successor = new Map<string, string>();
  for (const { from, to } of nextEdges) {
    if (successor.has(from)) return false;
    successor.set(from, to);
  }
  const visited = new Set<string>();
  let current: string | undefined = graph.start;
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    current = successor.get(current);
  }
  return current === undefined && visited.size === roomIds.length;
}

function checkGraph(museum: MuseumShape, ctx: z.RefinementCtx): boolean {
  const graph = museum.graph!;
  const roomIds = new Set(museum.rooms.map((r) => r.id));
  let valid = true;
  const fail = (message: string, path: (string | number)[]) => {
    valid = false;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["graph", ...path] });
  };

  if (!roomIds.has(graph.start)) fail(`graph.start no existe: "${graph.start}"`, ["start"]);
  graph.edges.forEach((edge, i) => {
    for (const end of [edge.from, edge.to]) {
      if (!roomIds.has(end)) fail(`arista hacia una sala inexistente: "${end}"`, ["edges", i]);
    }
    if (edge.from === edge.to) fail(`arista de una sala a sí misma: "${edge.from}"`, ["edges", i]);
  });
  if (!valid) return false;

  const reachable = reachableFrom(graph);
  for (const id of roomIds) {
    if (!reachable.has(id)) fail(`sala inalcanzable desde graph.start: "${id}"`, ["edges"]);
  }
  return valid;
}

function checkModeGraph(museum: MuseumShape, ctx: z.RefinementCtx) {
  const graph = museum.graph!;
  const roomIds = museum.rooms.map((r) => r.id);
  const fail = (message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["graph", "edges"] });

  switch (museum.mode) {
    case "exploration":
      // Conexo (ya validado) y con n-1 aristas: es un árbol.
      if (graph.edges.length !== roomIds.length - 1) {
        fail("modo exploration: el grafo debe ser un árbol desde graph.start");
      }
      break;
    case "education":
    case "biography":
      if (!isNextPathCoveringAll(graph, roomIds)) fail(linearPathMessage(museum.mode));
      break;
  }
}

function checkMuseum(museum: MuseumShape, ctx: z.RefinementCtx) {
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

  const roomIds = new Set<string>();
  const pieceIds = new Set<string>();
  const imageIds = new Set<string>();

  museum.rooms.forEach((room, r) => {
    if (roomIds.has(room.id)) issue(`id de sala duplicado: "${room.id}"`, ["rooms", r, "id"]);
    roomIds.add(room.id);
    if (museum.mode === "biography" && !room.period) {
      issue(`modo biography: la sala "${room.id}" necesita period`, ["rooms", r, "period"]);
    }

    room.pieces.forEach((piece, p) => {
      const path = ["rooms", r, "pieces", p];
      if (pieceIds.has(piece.id)) issue(`id de pieza duplicado: "${piece.id}"`, [...path, "id"]);
      pieceIds.add(piece.id);

      if (piece.image) {
        if (imageIds.has(piece.image.imageId)) {
          issue(`la imagen "${piece.image.imageId}" se usa en más de una pieza`, [...path, "image"]);
        }
        imageIds.add(piece.image.imageId);
      }

      if (piece.quiz && piece.quiz.answerIndex >= piece.quiz.options.length) {
        issue(`la respuesta del quiz de "${piece.id}" no está entre las opciones`, [...path, "quiz"]);
      }
      if (museum.mode === "quiz" && !piece.quiz) {
        issue(`modo quiz: la pieza "${piece.id}" necesita quiz`, [...path, "quiz"]);
      }
    });
  });

  if (museum.graph && checkGraph(museum, ctx)) checkModeGraph(museum, ctx);
}

export const MuseumSchema = MuseumObjectSchema.superRefine(checkMuseum);

/** Imágenes asignadas que no llegaron en el request. Necesita el request, por eso no está en el schema. */
export function findImageAssignmentIssues(museum: Museum, requestImageIds: string[]): string[] {
  const sent = new Set(requestImageIds);
  return museum.rooms.flatMap((room) =>
    room.pieces
      .filter((piece) => piece.image && !sent.has(piece.image.imageId))
      .map(
        (piece) =>
          `la pieza "${piece.id}" usa una imagen que no está en el request: "${piece.image!.imageId}"`,
      ),
  );
}

export const SourceSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["docx", "xlsx", "csv", "txt"]),
  /** Texto ya extraído en el navegador: los archivos nunca llegan al servidor. */
  text: z.string().max(LIMITS.maxNotesChars),
});

export const InputImageSchema = z.object({
  /** Lo genera el frontend: img-1, img-2... */
  id: z.string().regex(/^img-\d{1,2}$/, "id de imagen inválido"),
  name: z.string().min(1).max(120),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  /** Base64, redimensionada en el navegador a <= 1024 px. */
  data: z.string().min(1),
});

const RequestObjectSchema = z.object({
  mode: MuseumModeSchema.default("exploration"),
  prompt: z.string().trim().min(1).max(LIMITS.maxNotesChars),
  sources: z.array(SourceSchema).max(5).default([]),
  images: z.array(InputImageSchema).max(LIMITS.maxImages).default([]),
});

function checkTextLimit(request: { prompt: string; sources: { text: string }[] }, ctx: z.RefinementCtx) {
  const total = request.sources.reduce((sum, s) => sum + s.text.length, request.prompt.length);
  if (total > LIMITS.maxNotesChars) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `el texto total supera ${LIMITS.maxNotesChars} caracteres`,
      path: ["sources"],
    });
  }
}

export const GenerateMuseumRequestSchema = RequestObjectSchema.superRefine((request, ctx) => {
  checkTextLimit(request, ctx);
  const ids = request.images.map((i) => i.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ids de imagen duplicados", path: ["images"] });
  }
});

export const ImprovePromptRequestSchema = RequestObjectSchema.omit({ images: true }).superRefine(checkTextLimit);

export const ImprovePromptResponseSchema = z.object({
  suggestions: z.array(z.string().min(1).max(200)).max(5),
  improvedPrompt: z.string().min(1).max(2_000),
});

export type MuseumMode = z.infer<typeof MuseumModeSchema>;
export type Part = z.infer<typeof PartSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type Glyph = z.infer<typeof GlyphShape>;
export type ImageSearch = z.infer<typeof ImageSearchSchema>;
export type ResolvedImage = z.infer<typeof ResolvedImageSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
export type PieceSource = z.infer<typeof PieceSourceSchema>;
export type Piece = z.infer<typeof PieceSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type Graph = z.infer<typeof MuseumGraphSchema>;
export type Museum = z.infer<typeof MuseumSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type InputImage = z.infer<typeof InputImageSchema>;
export type GenerateMuseumRequest = z.infer<typeof GenerateMuseumRequestSchema>;
export type ImprovePromptRequest = z.infer<typeof ImprovePromptRequestSchema>;
export type ImprovePromptResponse = z.infer<typeof ImprovePromptResponseSchema>;

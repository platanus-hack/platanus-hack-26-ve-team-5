---
name: architecture
description: Arquitectura real del palacio 3D en app/ (feature/phase-1-core): parsers de texto, JSON y CSV, contrato Palace con límites, layout procedural determinista y escena React + R3F. Usar al tocar app/src/palace, el contrato Palace, el layout o las colisiones, la escena en app/src/scene, o al parsear la entrada del usuario. Cuando el usuario diga "contrato", "layout", "parser", "pedestal", "sala", "colisiones", "examen" o "?demo".
---

# Arquitectura del palacio (app/)

Todo corre en el navegador. No hay servidor, ni llamadas a Claude, ni generación de imágenes en este branch.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/src/palace/schema.ts` | Contrato `Palace` (Zod) y `LIMITS` |
| `app/src/palace/parse.ts` | `parsePalace`: texto, JSON o CSV → `Palace` con warnings |
| `app/src/palace/layout.ts` | `buildLayout`: geometría determinista, `roomAt`, `moveWithCollisions` |
| `app/src/palace/match.ts` | `isCorrectAnswer`: modo examen, tolera tildes y typos |
| `app/src/palace/example.ts` | `EXAMPLE_TEXT` para el landing y `?demo` |
| `app/src/scene/*` | Escena R3F: `World`, `Room`, `Shapes`, `Player`, `Preview` |
| `app/src/ui/*` | `Landing`, `Hud`, `Minimap` |
| `app/src/store.ts` | Estado (zustand), incluye resultados del examen |

## Contrato

```ts
LIMITS = { maxInputChars: 50_000, maxRooms: 12, maxConceptsPerRoom: 16,
           maxTitle: 80, maxDetail: 400, maxMetaphor: 120 }
Palace = { title, rooms: Room[] }        // 1..12 salas
Room   = { id, title, concepts: Concept[] }   // 0..16 conceptos
Concept = { id, title, detail, metaphor? }
```

- El parser nunca lanza: devuelve `{ ok: false, error }` o `{ ok: true, palace, warnings }`.
- Si excede un límite, recorta y avisa en `warnings` (salas) o rechaza (caracteres).
- El texto se trata como texto: no se interpreta HTML.
- Cualquier fuente (texto, JSON, CSV, o un LLM en el futuro) debe producir exactamente este contrato.

## Layout

- Función pura: misma entrada → misma salida. La semilla sale de `hash()` sobre los textos.
- Salas en cuadrícula de `ceil(sqrt(n))` columnas, unidas por corredores de `CORRIDOR_LEN = 6`.
- Puertas de `DOOR_W = 2.8`, paredes de `WALL_T = 0.4`.
- Cada sala es un anillo de pedestales. Radio `max(3.2, count × 2.6 / 2π)`; algunas salas son alargadas (`aspect 1.35`).
- Cada concepto es un pedestal (`PEDESTAL_SIZE = 0.9`) con una forma de `SHAPES`. Cada sala tiene un monumento de `MONUMENTS`.
- Colisiones AABB: `moveWithCollisions` contra paredes y pedestales. Sin física.
- El jugador aparece en una esquina sin puerta, mirando al monumento (`layout.ts` ~línea 195).

## Escena

- Sin assets externos: todo son primitivas de three.js (box, cylinder, sphere, torus, icosahedron y similares; `ShapeGeometry` para los símbolos).
- Sin GLB ni texturas en este branch.
- `Player` detecta el pedestal que se mira y está al alcance.

## Modo examen

- `ExamCard` en `Hud.tsx` compara la respuesta con `isCorrectAnswer` y guarda el resultado en el store.

## Límites al desarrollar

- No añadir servidor ni llamadas a APIs sin decisión del equipo; esta rama es solo cliente.
- Si el cambio altera `Palace`, actualizar `schema.ts`, `parse.ts`, `example.ts` y los tests a la vez.
- Los tests viven en `app/src/palace/palace.test.ts`. Con el estado actual cubren parsers, límites, no solapes de salas e `isCorrectAnswer`.

## Antes de dar por terminado un cambio

- [ ] ¿El cambio respeta `LIMITS`?
- [ ] ¿El layout sigue siendo determinista?
- [ ] ¿`palace.test.ts` pasa?
- [ ] ¿`?demo` sigue cargando el palacio de ejemplo?

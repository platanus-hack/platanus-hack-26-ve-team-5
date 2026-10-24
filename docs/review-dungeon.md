# Review: dungeon-core, adaptador y escena (dev @ 08a0c49)

Alcance: código de `packages/dungeon-core`, `apps/web/src/scene/DungeonAssets.tsx`, `World.tsx`, `Player.tsx`, `Hud.tsx`, `Minimap.tsx`, `App.tsx` y `scripts/setup_assets.sh`. Binarios y assets no revisados (ver `CLAUDE.md`, regla 2).

## Veredicto
⚠️ Aprobar con cambios

## Hallazgos
| # | Sev | Ubicación | Problema | Corrección propuesta |
|---|-----|-----------|----------|----------------------|
| 1 | 🟠 | `packages/dungeon-core/src/application/agent/AutonomousDungeonAgent.ts:150-166` | `decide()` sigue un path planeado y solo recalcula si cambia el target o el path se vacía. Si un movimiento falla o aparece una pared nueva, el agente sigue con un path obsoleto. `computePathTo` (265-281) trata celdas desconocidas como caminables, así que el path cruza zonas no vistas. Evidencia: con una meta conocida y sin llave, el agente decidió `MOVE_LEFT` hacia x<0, fuera de la grilla. | Antes de avanzar, comprobar que `plannedPath[0]` sea adyacente a `currentPosition`; si no, o si la siguiente celda ya es `WALL`, recalcular el path. |
| 2 | 🟠 | `apps/web/src/scene/DungeonAssets.tsx:126` (una `pointLight` por puerta, dos por corredor en `World.tsx`) | Las point lights son caras en el shader de three.js y su número crece con el laberinto. | Una luz por cámara, o solo en puertas abiertas; o usar material emisivo. |
| 3 | 🟡 | `apps/web/src/scene/Player.tsx:48, 136`; `apps/web/src/ui/Hud.tsx:152`; `apps/web/src/ui/Minimap.tsx:11` | Llave, cofre, trampa y puerta se identifican buscando `key`/`llave` en id o título. "Monkey" o "Hockey" se tratan como llave. `Player.tsx:136` recoge la llave al acercarse a 1.8 m sin pulsar E, mientras el HUD dice "Recoger". | Agregar `kind` al `Piece` (o usar el `catalog.id` que ya genera `DungeonPalaceAdapter`) y comparar contra ese campo. |
| 4 | 🟡 | `packages/dungeon-core/src/adapters/DungeonPalaceAdapter.ts:29-34` | Las "cámaras conectadas" se parten por índice en el arreglo de piezas (orden fila-mayor), no por conectividad. | Partir por región de la grilla o por componente conexo sin la puerta; si es provisional, documentarlo. |
| 5 | 🟡 | `scripts/setup_assets.sh:69-78` | El heredoc sobrescribe `apps/web/public/models/catalog.json`; cualquier entrada añadida a mano se pierde. | Hacer merge con el JSON existente o dejar de generarlo, ya que los assets están trackeados. |
| 6 | 🟡 | `apps/web/src/App.tsx:16` y `:31` | `?demo=dungeon` entra al palacio dos veces: al cargar el módulo y en el `useEffect`. | Quitar una de las dos. |
| 7 | 🔵 | `apps/web/src/scene/DungeonAssets.tsx:139` | `isGated?` sigue en el tipo de `AssetDoorway` sin uso. Nits: `Math.max(thickness / 1, 0.4)`, `useGLTF.preload` dentro de un `try` innecesario. | Quitar el prop no usado y simplificar. |

## Lo que está bien
- `DungeonAssets` ahora usa `scene.clone(true)` por instancia, lo que corrige la mutación del modelo cacheado. La animación con `damp` en `useFrame` es sencilla.
- `DungeonSandboxEngine` separa perceive → decide → apply y tiene pruebas de episodio y de A*.
- `DungeonGrid` y `Tile` concentran la regla de caminabilidad y visión en un solo lugar.

## Lo que no se verificó
- La simulación aleatoria de laberintos no terminó (el proceso quedó sin uso de CPU hasta el timeout); la causa no se investigó. El hallazgo 1 se basa en lectura de código y en un caso dirigido.
- No se corrió la app en el navegador.

## Preguntas al autor
- ¿Las dos puertas por corredor deben comportarse distinto? Hoy la de salida siempre está abierta (`isOpen={true}`) y la de entrada depende de la llave.

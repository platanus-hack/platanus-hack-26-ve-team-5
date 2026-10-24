---
name: 3d-validation
description: Validación del palacio 3D de app/ (feature/phase-1-core) en cuatro capas (lógica, rendimiento, visual, humana) y checklist previo a la demo. Usar al probar el layout, medir draw calls o FPS, tomar capturas, revisar la escena antes de desplegar, y cuando el usuario diga "valida el 3D", "draw calls", "rendimiento", "captura", "tests del layout" o "listo para la demo".
---

# Validación del palacio 3D

Ejecutar las capas en orden; cada una es más cara que la anterior. Los comandos y rutas son del branch `feature/phase-1-core`.

## Capa A: lógica (Vitest, USD 0)

Tests en `app/src/palace/palace.test.ts`, sin GPU.

Ya existen:
- `buildLayout`: las salas no se solapan.
- `parsePalace`: formatos, límites, JSON inválido sin lanzar, HTML tratado como texto.
- `isCorrectAnswer`: tildes, mayúsculas y typos menores; respuestas vacías o distintas.

Pendientes (no están escritos aún):
- Ningún pedestal queda sobre el hueco de una puerta (margen libre alrededor de `DOOR_W`).
- Ningún par de pedestales se solapa, incluida la sala de radio mínimo (3.2) con 2 conceptos o más.
- Todas las salas son alcanzables desde la primera (recorrer el grafo de puertas).
- N conceptos producen N pedestales en el layout.
- Misma entrada produce el mismo layout (determinismo).

Si el test pendiente falla, no se corrige el test: se corrige el layout.

## Capa B: rendimiento (USD 0)

Alcance: la demo es solo en escritorio. Presupuesto propuesto: menos de 300 draw calls. Un presupuesto móvil (menos de 100) aplica solo si el equipo decide soportar móvil.

Como no hay texturas ni GLB en este branch, el riesgo está en las primitivas: muchos pedestales y monumentos sin instancing. Medir antes de optimizar.

```ts
const { render, memory } = gl.info;
console.table({ drawCalls: render.calls, triangles: render.triangles,
                geometries: memory.geometries, textures: memory.textures });
```

Herramientas: `gl.info`, `Stats`, r3f-perf. El WebGL sin cabeza de Playwright no sirve para medir FPS; medir en un navegador real.

## Capa C: visual (~USD 0.05 por ronda *(est.)*)

1. Con Playwright, tomar 6–10 capturas desde posiciones fijas. Usar `?demo` para cargar siempre el mismo palacio.
2. Revisar las capturas en el chat de claude.ai para no gastar créditos de API.
3. Buscar: pedestales atravesados por paredes, monumento que tapa una puerta, etiquetas ilegibles, colores de sala que se confunden entre sí.

## Capa D: humana (15 min, USD 0)

- El jugador no atraviesa paredes ni pedestales al caminar.
- El texto del pedestal que se mira se lee a 2 m.
- El modo examen responde y guarda el resultado.
- Se prueba en una laptop con GPU integrada.
- La demo es en escritorio; el control con ratón no es fiable en móviles.

## Checklist previo a la demo

- [ ] `palace.test.ts` pasa completo.
- [ ] `?demo` carga el palacio de ejemplo sin errores en consola.
- [ ] Capa B dentro del presupuesto de escritorio.
- [ ] Capa C revisada.
- [ ] Ensayo completo: entrada, recorrido y examen.

## Reporte (formato fijo)

```
Capa A: OK | FALLA <detalle> | pendientes: <lista>
Capa B: draw calls <n>, triángulos <n>, geometrías <n>
Capa C: <hallazgos o "sin hallazgos">
Capa D: <hallazgos o "pendiente">
Veredicto: LISTO | BLOQUEADO por <causa>
```

# Fuentes (trazabilidad) e imágenes

Dos capacidades relacionadas con "de dónde sale esto":

1. **Trazabilidad:** cada concepto cita un fragmento de los apuntes del usuario. El servidor
   comprueba la cita; si no aparece, el concepto se marca como **agregado por la IA**.
2. **Imágenes:** los cuadros pueden mostrar una imagen real de dominio público (Wikipedia y
   Wikimedia Commons) o una imagen que subió el usuario.

---

## 1. Trazabilidad de citas

### Qué se guarda

| Campo | Dónde | Qué es |
|---|---|---|
| `piece.source.quote` | `Piece` | Fragmento literal de los apuntes (≤ 240 caracteres), **el texto real encontrado** |
| `piece.source.line` | `Piece` | Línea 1-based donde empieza (la calcula el servidor, nunca la IA) |
| `piece.unverified` | `Piece` | `true` si la cita no se encontró: la IA agregó la idea |
| `museum.sourceTextHash` | `Museum` | SHA-256 de los apuntes contra los que se verificó |
| `store.sourceText` | `localStorage` | Apuntes originales (≤ 50 000) para mostrar el contexto. Solo en el navegador |

### Flujo

```
IA → quote (copiada, NO parafraseada)
  → sanitizeRawSources: recorta a 240 car. y descarta "line" que mandó la IA
  → MuseumSchema
  → verifySources(museum, notes)
      · apuntes normalizados una vez (prepareText); locateIn(preparado, quote) para cada pieza
      · encontrada  → source = texto real de los apuntes + line; unverified no se marca
      · no encontrada → se quita source y se marca unverified: true
  → respuesta con stats en el log: "fuentes: 7/9 piezas verificadas, 2 sin fuente"
```

### Cómo se busca (`packages/shared/src/sources.ts`)

`locateFragment(text, fragment, from)`:

1. **Normaliza** ambos textos: NFC, espacios colapsados, minúsculas, comillas tipográficas
   y guiones unificados, caracteres invisibles fuera. Guarda un mapa a la posición original.
2. Busca la cita **completa**. Si aparece, es coincidencia exacta.
3. Si no aparece, busca la **subcadena común más larga** y la acepta si mide al menos el **60 %** de la cita (`MIN_FRAGMENT_RATIO`).
4. Citas de menos de 4 caracteres se rechazan.

> **Decisión a tener en cuenta:** una coincidencia parcial de ≥ 60 % cuenta como verificada. Así se
> toleran pequeñas diferencias de redacción de la IA. Pero una cita que solo comparte la mitad de sus
> palabras con los apuntes también pasa. Si el equipo quiere un criterio más estricto, es el cambio
> a hacer en `verifySources`.

### Qué ve el usuario

- En la landing: "17 de 17 conceptos verificados en tus apuntes", o "15 de 17 · 2 sin fuente".
- En el HUD: `SourceBlock` muestra el fragmento y su línea, con contexto (`palace/sources.ts#sourceView`).
- Los conceptos `unverified` muestran un aviso en `SourceBlock` ("la IA lo agregó"), y el contador de la landing cuenta cuántos hay.

### Modo sin IA

`palace/parse.ts` acepta la fuente solo si el JSON ya la trae. Nunca inventa una cita.

## 2. Imágenes de cuadros (Wikipedia y Commons)

### Pistas que pide la IA

```ts
ImageSearch = { wikiTitle?, commonsQuery?, lang? }
```

- `wikiTitle`: título **exacto** del artículo de Wikipedia en el idioma de los apuntes, con calificador si hay ambigüedad (p. ej. "Batalla de Carabobo (1821)").
- `commonsQuery`: 2 a 4 palabras clave en inglés para Wikimedia Commons.
- `lang`: código de 2 letras (default `es` en el servidor).
- Cada sala lleva `imageSearch` para su cuadro principal. Las piezas solo si tienen un referente real y dibujable. Las abstractas no lo llevan.

### Servidor (`apps/server/src/images.ts`)

| Ruta | Función |
|---|---|
| `GET /api/image?wiki=&commons=&lang=` | Resuelve la imagen: primero Wikipedia, luego Commons. Devuelve `ResolvedImage` |
| `GET /api/image/file?u=` | Proxy de bytes. **Solo hosts de Wikimedia**, HTTPS, URL ≤ 2 048 car. |

- Concurrencia máxima de **3** llamadas a Wikimedia.
- Clasificación `kind`: `painting`, `diagram` o `photo`.
- Caché de resoluciones (500, incluye "sin imagen") y de archivos (LRU 60 entradas / 40 MB).
- Errores transitorios (límite de tasa, 5xx, timeout) no se cachean como "sin imagen". Responden 502.

### Cliente (`apps/web/src/lib/images.ts`)

- `fetchResolvedImage`: comparte una sola petición entre llamadas iguales, también las simultáneas.
- **Reintentos** ante límite de Wikimedia: esperas de 2 s y 5 s; después da error transitorio.
- `useResolvedImage(search)` devuelve `undefined` mientras carga, `null` si no hay imagen, o la imagen.
- `peekResolvedImage` lee lo ya resuelto sin esperar (no hay "cargando" en un instante).
- `prefetchPalaceImages(palace)` descarga y decodifica en segundo plano al entrar.
- `creditLine(image)` arma la placa: título · autor · licencia. "public domain" se muestra como "Dominio público".

### Imágenes que sube el usuario (solo flujo nuevo)

- El contrato espera imágenes en base64, ya redimensionadas a ≤ 1024 px en el navegador (`InputImage`, ids `img-1`…`img-99`). **Hoy no hay código en el frontend que haga esto.**
- Máximo 6 por generación. El servidor las pasa a la IA con su id precedido de texto.
- La IA asigna cada imagen a **como mucho una** pieza (`piece.image.imageId`).
- Si la IA usa un id que no llegó en el request, la respuesta se rechaza y se reintenta.
- **Estado actual:** el servidor y el contrato lo soportan, pero la interfaz todavía no envía imágenes (ver [estado-y-pendientes.md](./estado-y-pendientes.md)).

## 3. Privacidad

- **El servidor no guarda apuntes.** Solo guarda en caché el resultado, con clave en hash.
- **Los archivos nunca llegan al servidor** (en el flujo nuevo, el texto ya se extrajo en el navegador).
- El navegador guarda los apuntes (≤ 50 000) en `localStorage` para mostrar la cita. Es del usuario y no sale de su equipo.
- Los logs del servidor solo registran conteos y tipos de error, nunca contenido.
- Ver [seguridad.md](./seguridad.md) §6.

## 4. Pruebas

| Archivo | Cubre |
|---|---|
| `packages/shared/src/sources.test.ts` | Normalización, búsqueda, verificación, recorte de citas |
| `apps/server/src/sources.test.ts` | Integración de la verificación en el servidor |
| `apps/server/src/images.test.ts` | Clasificación, URLs permitidas, caché |
| `apps/web/src/lib/images.test.ts`, `images.retry.test.ts` | Caché, deduplicación, reintentos |
| `apps/web/src/palace/sources.test.ts`, `sourceText.test.ts` | Vista de la fuente en el HUD |

## 5. Imágenes de Wikimedia: semilla y caché en disco

Orden de búsqueda (metadatos de `/api/image` y bytes de `/api/image/file`): **memoria → semilla → caché en disco → Wikimedia**.

- **Semilla** (`apps/server/seed/images/`, commiteada, solo lectura, archivos normales sin Git LFS): la demo (`?demo=historia`, `?demo=medicina`) funciona aunque Wikimedia nos limite la tasa. Nombres = sha256 de la consulta / URL.
- **Caché** (`IMAGE_CACHE_DIR`, por defecto `./.cache/images`, ignorada por Git): sobrevive a reinicios; guarda también los "sin imagen" definitivos, nunca errores transitorios. Tope `IMAGE_CACHE_MAX_MB` (200), borra lo más antiguo por mtime. En Render sin disco persistente se vacía en cada deploy (la semilla cubre la demo).
- **Cortesía con Wikimedia:** `User-Agent` de la política (`WIKIMEDIA_USER_AGENT` para cambiarlo), máx. 2 llamadas simultáneas, `Retry-After` respetado (tope 5 s, un reintento) y pausa global de unos segundos tras un 429.

Regenerar la semilla (lento a propósito: secuencial, 1,5 s entre consultas; reanudable, salta lo ya sembrado):

```bash
npx tsx apps/server/scripts/preload-images.ts          # desde la raíz del repo
npx tsx apps/server/scripts/preload-images.ts --force  # vuelve a pedir todo
```

Si imprime "error transitorio" (429), espera unos minutos y vuelve a ejecutarlo. Tope de 8 MB en total y ~900 KB por imagen (las PNG grandes bajan a 500/330 px). Después: `git add apps/server/seed` y commit.

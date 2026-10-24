---
name: token-budget
description: Disciplina de costo y tokens para desarrollar el proyecto con USD 50 de créditos de API en 24 h. Usar al iniciar una tarea, al elegir modelo (Haiku vs Sonnet), al decidir si delegar a un subagente, antes de leer archivos grandes, cuando el contexto crece, o cuando el usuario diga "ahorra tokens", "qué modelo uso", "cuánto llevamos gastado", "presupuesto" o "low cost".
---

# Presupuesto de tokens

Meta: terminar en 24 h sin pasar de USD 50 de créditos de API de Claude.
Gasto esperado ~USD 14–20 *(est.)*, peor caso ~USD 43 *(est.)*, reserva USD 5. Alerta de gasto a USD 35.

## Paso 1: elegir modelo (orden fijo, usar el primero que aplique)

| Tarea | Modelo |
|---|---|
| Algoritmo de layout, colisiones, contrato Palace y parsers | Sonnet 5.5 |
| Bug que Haiku no resolvió en 2 intentos | Sonnet 5.5 |
| Todo lo demás: UI, boilerplate, optimizar assets, `ASSETS.md`, tests simples, docs, commits | Haiku 5.5 |

Precios por millón de tokens (entrada/salida): Haiku USD 0.10 / 0.50, Sonnet USD 2 / 10. Sonnet cuesta ~20× más.
Fuente: documento de costos del proyecto, verificado el 23-oct-2026 contra la página de precios de Anthropic. Confirmar en la consola antes de decidir con estos números; si difieren, mandan los de la consola.

## Paso 2: acotar el contexto antes de actuar

1. Buscar con grep o leer con rango (`offset`/`limit`) antes de abrir un archivo entero.
2. Tareas ruidosas (tests, builds, logs largos): delegar a `test-runner` (Haiku) si está instalado (ver setup en `CLAUDE.md`). Si no, correr el comando con la salida acotada (`| tail -n 40`) y resumir solo lo que falla.
3. Al cerrar cada bloque del plan, reiniciar el contexto y dejar el estado en `TODO.md`.
4. Mantener cada prompt de Haiku bajo 100.000 tokens (por encima la tarifa sube a USD 0.50 / 2.50).
5. Una pausa de más de 5 min reconstruye la caché del contexto: agrupar el trabajo y evitar sesiones largas inactivas.
6. No pegar documentos enteros en el chat; referenciar el archivo.
7. Las capturas visuales se revisan en el chat de claude.ai, que no consume créditos de API.

## Paso 3: recortes ante retraso (en este orden)

1. Logros. 2. Monumentos con formas propias. 3. Chat con fuentes. (El CSV ya está implementado; no es recorte.)

Fuera de alcance por defecto: soporte móvil. La demo es solo en escritorio; el joystick virtual es un extra si sobra tiempo.

## Paso 4: control

- Pedir al usuario el gasto de la consola de Anthropic. No inventarlo ni estimarlo como dato real.
- Confirmar que los créditos son de API: no cubren Claude Code por suscripción y no se acumulan entre meses.

## Plan de 24 h y modelo sugerido

| Horas | Bloque | Modelo |
|---|---|---|
| 0–1.5 | Evaluar forks (go/no-go), repo, `ASSETS.md` | Haiku |
| 1.5–4 | Escena base y revisión de assets (usar `assets`) | Haiku |
| 4–10 | Layout con tests, salas, movimiento, colisiones | Sonnet |
| 10–15 | Modo examen, parsers y pulido del layout (usar `architecture`) | Sonnet |
| 15–18 | Interfaz: pegar/subir texto, carga, minimapa | Haiku |
| 18–21 | Look-dev y validación (usar `3d-validation`) | Mixto |
| 21–24 | Pre-generar demo, desplegar, ensayar, margen | Humano |

## Reporte al cerrar un bloque (formato fijo)

```
Bloque: <nombre y horas>
Modelo usado: <Haiku | Sonnet | mixto>
Hecho: <lista corta>
Pendiente o recortado: <lista corta>
Gasto de consola (dato del usuario): <USD o "sin dato">
```

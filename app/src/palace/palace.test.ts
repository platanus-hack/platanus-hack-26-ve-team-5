import { describe, expect, it } from 'vitest'
import { EXAMPLE_TEXT } from './example'
import { buildLayout, moveWithCollisions, roomAt } from './layout'
import { isCorrectAnswer } from './match'
import { detectFormat, parsePalace } from './parse'
import { LIMITS } from './schema'

const ok = (input: string, format?: Parameters<typeof parsePalace>[1]) => {
  const r = parsePalace(input, format)
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('parsePalace', () => {
  it('lee texto con encabezados y viñetas', () => {
    const { palace } = ok(EXAMPLE_TEXT)
    expect(palace.rooms).toHaveLength(4)
    expect(palace.rooms[0].title).toBe('Membrana celular')
    expect(palace.rooms[0].concepts[0]).toMatchObject({ title: 'Bicapa lipídica', detail: expect.stringContaining('fosfolípidos') })
  })

  it('acepta temas sin # seguidos de líneas indentadas', () => {
    const { palace } = ok('Tema A:\n  uno\n  dos\nTema B\n  tres')
    expect(palace.rooms.map((r) => r.title)).toEqual(['Tema A', 'Tema B'])
    expect(palace.rooms[0].concepts.map((c) => c.title)).toEqual(['uno', 'dos'])
  })

  it('texto plano sin jerarquía va a una sola sala', () => {
    const { palace } = ok('alfa\nbeta\ngamma')
    expect(palace.rooms).toHaveLength(1)
    expect(palace.rooms[0].concepts).toHaveLength(3)
  })

  it('lee JSON en formas sueltas', () => {
    expect(ok('{"T1":["a","b"],"T2":{"c":"detalle"}}', 'json').palace.rooms[1].concepts[0]).toMatchObject({ title: 'c', detail: 'detalle' })
    expect(ok('[{"sala":"Cerebro","items":["Procesa info"]}]', 'json').palace.rooms[0].concepts[0].title).toBe('Procesa info')
    expect(ok('{"title":"X","rooms":[{"title":"R","concepts":[{"title":"c","metaphor":"m"}]}]}', 'json').palace.rooms[0].concepts[0].metaphor).toBe('m')
  })

  it('reporta JSON inválido sin lanzar', () => {
    const r = parsePalace('{nope', 'json')
    expect(r.ok).toBe(false)
  })

  it('lee CSV con encabezado, comillas y punto y coma', () => {
    const { palace } = ok('sala;concepto;detalle\nA;"uno; con punto y coma";d1\nA;dos;d2\nB;tres;', 'csv')
    expect(palace.rooms).toHaveLength(2)
    expect(palace.rooms[0].concepts[0].title).toBe('uno; con punto y coma')
  })

  it('detecta el formato', () => {
    expect(detectFormat(' {"a":1}')).toBe('json')
    expect(detectFormat('a,b,c\nd,e,f\ng,h,i')).toBe('csv')
    expect(detectFormat(EXAMPLE_TEXT)).toBe('text')
  })

  it('aplica los límites de tamaño', () => {
    expect(parsePalace('x'.repeat(LIMITS.maxInputChars + 1)).ok).toBe(false)
    const many = Array.from({ length: 20 }, (_, i) => `# T${i}\n- c`).join('\n')
    const r = ok(many)
    expect(r.palace.rooms).toHaveLength(LIMITS.maxRooms)
    expect(r.warnings.length).toBeGreaterThan(0)
    const long = ok(`# T\n- ${'a'.repeat(500)}`)
    expect(long.palace.rooms[0].concepts[0].title.length).toBeLessThanOrEqual(LIMITS.maxTitle)
  })

  it('trata el contenido como texto (no interpreta HTML)', () => {
    const { palace } = ok('# <img src=x onerror=alert(1)>\n- <script>x</script>')
    expect(palace.rooms[0].title).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('buildLayout', () => {
  const sizes = [1, 2, 3, 4, 5, 7, 12]
  it.each(sizes)('con %i salas: el spawn está libre y todas las salas son alcanzables', (n) => {
    const text = Array.from({ length: n }, (_, i) => `# Sala ${i}\n${Array.from({ length: (i % 6) + 1 }, (_, k) => `- c${k}`).join('\n')}`).join('\n')
    const layout = buildLayout(ok(text).palace)
    expect(layout.rooms).toHaveLength(n)
    expect(layout.corridors).toHaveLength(n - 1)
    const { x, z } = layout.spawn
    expect(moveWithCollisions(layout.colliders, x, z, 0.01, 0.01)).toEqual({ x: x + 0.01, z: z + 0.01 })
    expect(roomAt(layout, x, z)?.index).toBe(0)

    // Caminar del centro de cada pasillo hacia ambas salas sin chocar.
    for (const c of layout.corridors) {
      const horizontal = c.floor.w > c.floor.d
      let px = c.floor.x
      let pz = c.floor.z
      for (let s = 0; s < 200; s++) {
        const next = moveWithCollisions(layout.colliders, px, pz, horizontal ? 0.1 : 0, horizontal ? 0 : 0.1)
        expect(next.x !== px || next.z !== pz).toBe(true)
        px = next.x
        pz = next.z
        if (roomAt(layout, px, pz)) break
      }
      expect(roomAt(layout, px, pz)).not.toBeNull()
    }
  })

  it('las salas no se solapan', () => {
    const text = Array.from({ length: 9 }, (_, i) => `# S${i}\n${'- c\n'.repeat(16)}`).join('\n')
    const { rooms } = buildLayout(ok(text).palace)
    for (const a of rooms)
      for (const b of rooms)
        if (a !== b) {
          const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2
          expect(overlap).toBe(false)
        }
  })
})

describe('isCorrectAnswer', () => {
  it('tolera tildes, mayúsculas y typos menores', () => {
    expect(isCorrectAnswer('bicapa lipidica', 'Bicapa lipídica')).toBe(true)
    expect(isCorrectAnswer('bicapa lipidca', 'Bicapa lipídica')).toBe(true)
    expect(isCorrectAnswer('Ciclo de Krebs', 'Ciclo de Krebs')).toBe(true)
  })
  it('rechaza respuestas vacías o distintas', () => {
    expect(isCorrectAnswer('', 'ATP')).toBe(false)
    expect(isCorrectAnswer('ADN', 'ATP')).toBe(false)
    expect(isCorrectAnswer('ATR', 'ATP')).toBe(false)
    expect(isCorrectAnswer('nucleo', 'Ciclo de Krebs')).toBe(false)
    expect(isCorrectAnswer('a', 'Transcripción')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { parsePalace } from './parse'
import { sourceView } from './sources'

const ok = (input: string, format?: Parameters<typeof parsePalace>[1]) => {
  const r = parsePalace(input, format)
  if (!r.ok) throw new Error(r.error)
  return r.palace
}

describe('parsePalace: fuente por concepto', () => {
  it('texto: guarda la línea 1-based y la línea original recortada', () => {
    const palace = ok('# Transporte\n\n  - Transporte activo: mueve sustancias contra gradiente gastando ATP\n- Osmosis')
    const [a, b] = palace.rooms[0].pieces
    expect(a.source).toEqual({ quote: '- Transporte activo: mueve sustancias contra gradiente gastando ATP', line: 3 })
    expect(b.source).toEqual({ quote: '- Osmosis', line: 4 })
  })

  it('texto: una línea de continuación no cambia la fuente del concepto', () => {
    const palace = ok('Tema A\n  uno: detalle\n    sigue el detalle\n  dos')
    expect(palace.rooms[0].pieces[0].source?.line).toBe(2)
    expect(palace.rooms[0].pieces[1].source?.line).toBe(4)
  })

  it('texto plano sin jerarquía: cada línea es su fuente', () => {
    const palace = ok('alfa\nbeta\ngamma')
    expect(palace.rooms[0].pieces.map((p) => p.source?.line)).toEqual([1, 2, 3])
  })

  it('recorta la cita a 240 caracteres y respeta CRLF', () => {
    const palace = ok(`# T\r\n- ${'x'.repeat(400)}\r\n- b`)
    expect(palace.rooms[0].pieces[0].source?.quote).toHaveLength(240)
    expect(palace.rooms[0].pieces[1].source?.line).toBe(3)
  })

  it('csv: usa el número de línea original, también tras líneas vacías', () => {
    const palace = ok('sala,concepto,detalle\nBio,Célula,unidad básica\n\nBio,ADN,guarda genes', 'csv')
    expect(palace.rooms[0].pieces.map((p) => p.source)).toEqual([
      { quote: 'Bio,Célula,unidad básica', line: 2 },
      { quote: 'Bio,ADN,guarda genes', line: 4 },
    ])
  })

  it('json suelto: solo agrega source si el JSON ya la trae', () => {
    const palace = ok(
      JSON.stringify({
        T: [
          { title: 'con', detail: 'x', source: { quote: ' frase original ', line: 7 } },
          { title: 'sin', detail: 'y' },
          { title: 'mala', source: { quote: '' } },
          { title: 'linea mala', source: { quote: 'q', line: 0 } },
        ],
      }),
      'json',
    )
    const [con, sin, mala, lineaMala] = palace.rooms[0].pieces
    expect(con.source).toEqual({ quote: 'frase original', line: 7 })
    expect(sin).not.toHaveProperty('source')
    expect(mala).not.toHaveProperty('source')
    expect(lineaMala.source).toEqual({ quote: 'q' })
  })

  it('json de museo completo conserva source y unverified tal cual', () => {
    const palace = ok(
      JSON.stringify({
        title: 'M',
        rooms: [
          {
            id: 'r',
            name: 'R',
            pieces: [
              { id: 'a', title: 'A', text: '', source: { quote: 'cita', line: 2 } },
              { id: 'b', title: 'B', text: '', unverified: true },
            ],
          },
        ],
      }),
      'json',
    )
    expect(palace.rooms[0].pieces[0].source).toEqual({ quote: 'cita', line: 2 })
    expect(palace.rooms[0].pieces[1].unverified).toBe(true)
  })
})

describe('sourceView', () => {
  const text = '# Transporte\nDifusión simple: pasa a favor\nTransporte activo: mueve sustancias contra gradiente gastando ATP\n\nOsmosis'

  it('resalta el fragmento dentro de su línea y da una línea de contexto', () => {
    const v = sourceView(text, { quote: 'mueve sustancias contra gradiente', line: 3 })
    expect(v.line).toBe(3)
    expect(v.pre).toBe('Transporte activo: ')
    expect(v.mark).toBe('mueve sustancias contra gradiente')
    expect(v.post).toBe(' gastando ATP')
    expect(v.context).toBe('Difusión simple: pasa a favor')
  })

  it('sin el texto guardado muestra solo la cita', () => {
    const v = sourceView(null, { quote: 'una cita', line: 9 })
    expect(v).toMatchObject({ line: 9, pre: '', mark: 'una cita', post: '' })
    expect(v.context).toBeUndefined()
  })

  it('si el texto guardado ya no coincide, no inventa contexto', () => {
    const v = sourceView('otro texto distinto', { quote: 'una cita', line: 1 })
    expect(v.mark).toBe('una cita')
    expect(v.context).toBeUndefined()
  })

  it('con la cita en la primera línea usa la siguiente como contexto', () => {
    expect(sourceView(text, { quote: '# Transporte', line: 1 }).context).toBe('Difusión simple: pasa a favor')
  })

  it('una cita de varias líneas se resalta hasta el fin de su primera línea', () => {
    const v = sourceView(text, { quote: 'pasa a favor Transporte activo', line: 2 })
    expect(v.mark).toBe('pasa a favor')
    expect(v.post).toBe('')
  })
})

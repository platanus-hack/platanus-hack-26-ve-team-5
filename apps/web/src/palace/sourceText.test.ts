import { describe, expect, it } from 'vitest'
import { capSourceText, MAX_SOURCE_TEXT } from '../store'

describe('capSourceText', () => {
  it('acepta texto y lo recorta al tope', () => {
    expect(capSourceText('apuntes')).toBe('apuntes')
    expect(capSourceText('x'.repeat(MAX_SOURCE_TEXT + 10))).toHaveLength(MAX_SOURCE_TEXT)
  })

  it('descarta lo que no es texto (almacenamiento corrupto o manipulado)', () => {
    for (const bad of [undefined, null, '', 42, {}, ['a']]) expect(capSourceText(bad)).toBeNull()
  })
})

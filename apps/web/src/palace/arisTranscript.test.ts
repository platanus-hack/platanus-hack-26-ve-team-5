import { describe, expect, it } from 'vitest'
import { normalizeTranscript } from './arisTranscript'

describe('normalizeTranscript', () => {
  it('strips leading filler words like "eh", "este", "bueno", "aris"', () => {
    expect(normalizeTranscript('eh este Aris qué falta memorizar?')).toBe('qué falta memorizar')
    expect(normalizeTranscript('Bueno mira, adónde voy ahora')).toBe('adónde voy ahora')
    expect(normalizeTranscript('Oye Aris, dónde está la llave')).toBe('dónde está la llave')
  })

  it('normalizes colloquial phrases to core query tokens', () => {
    expect(normalizeTranscript('a donde tengo que ir')).toBe('adónde tengo que ir')
    expect(normalizeTranscript('pa donde voy')).toBe('adónde voy')
    expect(normalizeTranscript('cuanto llevo memorizado')).toBe('cómo voy memorizado')
    expect(normalizeTranscript('dónde encuentro la yave')).toBe('dónde encuentro la llave')
    expect(normalizeTranscript('cómo abro las compuertas')).toBe('cómo abro las puerta')
  })

  it('preserves text if user only spoke a greeting or name', () => {
    expect(normalizeTranscript('Aris')).toBe('Aris')
    expect(normalizeTranscript('hola')).toBe('hola')
  })

  it('cleans trailing punctuation and excess whitespace', () => {
    expect(normalizeTranscript('¿Qué falta memorizar???')).toBe('¿Qué falta memorizar')
    expect(normalizeTranscript('  adónde   voy   ahora...  ')).toBe('adónde voy ahora')
  })

  it('enforces max length strictly', () => {
    const longQuery = 'palabra '.repeat(50)
    expect(normalizeTranscript(longQuery, 40).length).toBeLessThanOrEqual(40)
  })

  it('handles empty or non-string inputs safely', () => {
    expect(normalizeTranscript('')).toBe('')
    // @ts-expect-error test invalid type
    expect(normalizeTranscript(null)).toBe('')
  })
})

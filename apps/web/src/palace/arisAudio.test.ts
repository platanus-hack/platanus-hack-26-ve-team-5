import { describe, expect, it, vi } from 'vitest'
import {
  cleanTextForSpeech,
  selectBestSpanishVoice,
  playArisVoice,
  type IArisVoiceEngine,
} from './arisAudio'

describe('cleanTextForSpeech', () => {
  it('removes Aris: prefix', () => {
    expect(cleanTextForSpeech('Aris: ¡Hola! Soy tu guía.')).toBe('¡Hola! Soy tu guía.')
  })

  it('removes markdown formatting, bullet points and urls', () => {
    const raw = 'Aris: Consulta esto: • *Opción 1* en https://mus3o.app'
    expect(cleanTextForSpeech(raw)).toBe('Consulta esto: Opción 1 en')
  })

  it('removes quotes cleanly', () => {
    expect(cleanTextForSpeech('Aris: Mira la "mitocondria"')).toBe('Mira la mitocondria')
  })

  it('handles empty strings gracefully', () => {
    expect(cleanTextForSpeech('')).toBe('')
  })
})

describe('selectBestSpanishVoice', () => {
  const mockVoice = (name: string, lang: string): SpeechSynthesisVoice => ({
    name,
    lang,
    default: false,
    localService: true,
    voiceURI: name,
  })

  it('prefers natural / high-quality Spanish voices when available', () => {
    const voices = [
      mockVoice('Alex', 'en-US'),
      mockVoice('Juan Standard', 'es-ES'),
      mockVoice('Microsoft Sabina Online (Natural)', 'es-MX'),
    ]
    const selected = selectBestSpanishVoice(voices)
    expect(selected?.name).toBe('Microsoft Sabina Online (Natural)')
  })

  it('falls back to general Spanish voice if no preferred name matches', () => {
    const voices = [
      mockVoice('Alex', 'en-US'),
      mockVoice('Standard Spanish', 'es-ES'),
    ]
    const selected = selectBestSpanishVoice(voices)
    expect(selected?.name).toBe('Standard Spanish')
  })

  it('returns first available voice if no Spanish voice exists', () => {
    const voices = [mockVoice('English Voice', 'en-US')]
    const selected = selectBestSpanishVoice(voices)
    expect(selected?.name).toBe('English Voice')
  })

  it('returns null when voices array is empty', () => {
    expect(selectBestSpanishVoice([])).toBeNull()
  })
})

describe('playArisVoice', () => {
  it('does NOT speak when muted is true', () => {
    const mockEngine: IArisVoiceEngine = {
      speak: vi.fn(),
      cancel: vi.fn(),
    }

    playArisVoice('Aris: Mensaje de prueba', { muted: true, engine: mockEngine })
    expect(mockEngine.speak).not.toHaveBeenCalled()
  })

  it('speaks when muted is false', () => {
    const mockEngine: IArisVoiceEngine = {
      speak: vi.fn(),
      cancel: vi.fn(),
    }

    playArisVoice('Aris: Mensaje de prueba', { muted: false, engine: mockEngine })
    expect(mockEngine.speak).toHaveBeenCalledWith('Aris: Mensaje de prueba')
  })
})

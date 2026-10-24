/**
 * Motor de audio y voz ligera para Aris:
 * - 0 KB de dependencias externas. Costo $0.
 * - Síntesis de sonido procedural (Web Audio API) para feedback inmediato (chirp robótico).
 * - Despachador de síntesis de voz (Web Speech API) con selección inteligente de voces en español.
 * - Interfaz desacoplada (VoiceEngine) lista para soportar proveedores externos (ej. ElevenLabs) a futuro.
 */

export interface VoiceOptions {
  pitch?: number
  rate?: number
  lang?: string
}

export interface IArisVoiceEngine {
  speak: (text: string, options?: VoiceOptions) => void
  cancel: () => void
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtxClass) return null
  try {
    if (!audioCtx) {
      audioCtx = new AudioCtxClass()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Genera un chime/chirp procedural robótico suave (80-120 ms).
 * Utiliza osciladores nativos de Web Audio con modulación de frecuencia y caída exponencial.
 */
export function playArisChirp(type: 'greet' | 'think' | 'success' = 'greet') {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    gain.gain.setValueAtTime(0.0001, now)

    if (type === 'greet') {
      // Dos tonos ascendentes alegres tipo asistente robótico
      osc.frequency.setValueAtTime(587.33, now) // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.08) // A5
      gain.gain.linearRampToValueAtTime(0.06, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    } else if (type === 'think') {
      // Tono suave modulado
      osc.frequency.setValueAtTime(440.0, now) // A4
      osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.06) // C#5
      gain.gain.linearRampToValueAtTime(0.04, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
    } else {
      // Acorde rápido de éxito
      osc.frequency.setValueAtTime(523.25, now) // C5
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1) // C6
      gain.gain.linearRampToValueAtTime(0.05, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
    }

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.15)
  } catch {
    // Si el navegador bloquea audio sin interacción previa, falla silenciosamente
  }
}

/**
 * Selecciona la mejor voz en español disponible en el sistema operativo / navegador.
 */
export function selectBestSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null

  // 1. Preferir voces en español naturales o locales
  const esVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('es'))
  if (esVoices.length === 0) return voices[0] || null

  // Priorizar voces comunes de alta calidad en navegadores (Google, Microsoft, Mónica, Paulina)
  const preferred = esVoices.find((v) =>
    /natural|online|google|sabina|mónica|monica|jorge|paulina/i.test(v.name)
  )
  if (preferred) return preferred

  // Fallback a dialectos generales
  const esGeneral = esVoices.find((v) => v.lang.toLowerCase().includes('es-419') || v.lang.toLowerCase().includes('es-es'))
  return esGeneral || esVoices[0]
}

/**
 * Limpia el texto para lectura natural por el sintetizador:
 * Quita prefijos, markdown, bullets y URLs.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return ''
  return text
    .replace(/^Aris:\s*/i, '')
    .replace(/\*+/g, '')
    .replace(/•\s*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/["'`]/g, '')
    .trim()
}

/**
 * Adaptador de SpeechSynthesis nativo (0 KB de dependencias).
 */
export class WebSpeechVoiceEngine implements IArisVoiceEngine {
  speak(text: string, options?: VoiceOptions) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    try {
      this.cancel()
      const cleanText = cleanTextForSpeech(text)
      if (!cleanText) return

      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.lang = options?.lang || 'es-ES'
      utterance.pitch = options?.pitch ?? 1.25 // Ligeramente agudo para carácter amigable
      utterance.rate = options?.rate ?? 1.05

      const voices = window.speechSynthesis.getVoices()
      const chosenVoice = selectBestSpanishVoice(voices)
      if (chosenVoice) {
        utterance.voice = chosenVoice
      }

      window.speechSynthesis.speak(utterance)
    } catch {
      // Falla silenciosa si las políticas de autoplay lo restringen
    }
  }

  cancel() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  }
}

// Instancia por defecto
export const defaultVoiceEngine: IArisVoiceEngine = new WebSpeechVoiceEngine()

/**
 * Despacha la voz de Aris con feedback sonoro procedural y control de mute.
 */
export function playArisVoice(
  text: string,
  options: { muted?: boolean; engine?: IArisVoiceEngine } = {}
) {
  if (options.muted) return

  // 1. Chime procedural inmediato (feedback táctil de habla)
  playArisChirp('greet')

  // 2. Locución por voz
  const engine = options.engine || defaultVoiceEngine
  engine.speak(text)
}

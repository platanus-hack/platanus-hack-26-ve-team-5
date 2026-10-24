import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeTranscript } from './arisTranscript'

export interface UseSpeechRecognitionOptions {
  onFinalResult: (transcript: string) => void
  autoSendDelayMs?: number
}

/** Detecta dinámicamente el dialecto preferido del usuario con fallback seguro a español */
export function resolveUserSpeechLanguage(): string {
  if (typeof navigator === 'undefined' || !navigator.language) return 'es-419'
  const navLang = navigator.language.trim()
  if (navLang.toLowerCase().startsWith('es')) {
    return navLang
  }
  return 'es-419'
}

export function useSpeechRecognition({
  onFinalResult,
  autoSendDelayMs = 400,
}: UseSpeechRecognitionOptions) {
  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [errorStatus, setErrorStatus] = useState<'not-allowed' | 'no-speech' | 'network' | 'unknown' | null>(null)

  const recognitionRef = useRef<any>(null)
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onFinalResultRef = useRef(onFinalResult)
  onFinalResultRef.current = onFinalResult

  const clearTimer = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current)
      autoSendTimerRef.current = null
    }
  }, [])

  const stopListening = useCallback(() => {
    clearTimer()
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
    }
    setIsListening(false)
    setInterimText('')
  }, [clearTimer])

  const startListening = useCallback(() => {
    if (!isSupported) return
    clearTimer()
    setErrorStatus(null)
    setInterimText('')

    try {
      const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const rec = new SpeechClass()

      rec.lang = resolveUserSpeechLanguage()
      rec.continuous = false
      rec.interimResults = true

      rec.onstart = () => {
        setIsListening(true)
        setErrorStatus(null)
      }

      rec.onresult = (e: any) => {
        let interim = ''
        let final = ''

        for (let i = e.resultIndex; i < e.results.length; ++i) {
          const item = e.results[i]
          const transcriptPart = item[0]?.transcript || ''
          if (item.isFinal) {
            final += transcriptPart
          } else {
            interim += transcriptPart
          }
        }

        if (interim) {
          setInterimText(interim)
        }

        if (final) {
          const normalized = normalizeTranscript(final)
          setInterimText(normalized)

          // Auto-envío tras breve delay perceptivo para que el usuario confirme lo que se transcribió
          clearTimer()
          autoSendTimerRef.current = setTimeout(() => {
            setIsListening(false)
            setInterimText('')
            onFinalResultRef.current(normalized)
          }, autoSendDelayMs)
        }
      }

      rec.onerror = (e: any) => {
        setIsListening(false)
        const errType = e.error
        if (errType === 'not-allowed' || errType === 'permission-denied') {
          setErrorStatus('not-allowed')
        } else if (errType === 'no-speech') {
          setErrorStatus('no-speech')
        } else if (errType === 'network') {
          setErrorStatus('network')
        } else {
          setErrorStatus('unknown')
        }
      }

      rec.onend = () => {
        // Solo marcar apagado si no hay un temporizador activo pendiente de enviar
        if (!autoSendTimerRef.current) {
          setIsListening(false)
        }
      }

      recognitionRef.current = rec
      rec.start()
    } catch {
      setIsListening(false)
      setErrorStatus('unknown')
    }
  }, [isSupported, clearTimer, autoSendDelayMs])

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  useEffect(() => {
    return () => {
      clearTimer()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
      }
    }
  }, [clearTimer])

  return {
    isSupported,
    isListening,
    interimText,
    errorStatus,
    startListening,
    stopListening,
    toggleListening,
  }
}

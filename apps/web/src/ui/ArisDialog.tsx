import { useEffect, useState } from 'react'
import { pointerLock } from '../scene/pointerLock'
import { useStore } from '../store'
import { useSpeechRecognition } from '../palace/useSpeechRecognition'

export function ArisDialog() {
  const message = useStore((s) => s.arisMessage)
  const close = useStore((s) => s.closeArisDialog)
  const isMuted = useStore((s) => s.arisMuted)
  const toggleMute = useStore((s) => s.toggleArisMute)

  useEffect(() => {
    if (!message) return
    // Auto-cierre a los 10 segundos si el usuario no lo cierra antes
    const timer = setTimeout(() => {
      close()
    }, 10000)
    return () => clearTimeout(timer)
  }, [message, close])

  if (!message) return null

  return (
    <aside className="aris-bubble" aria-live="polite">
      <div className="aris-bubble-header">
        <span className="aris-avatar">🤖</span>
        <span className="aris-name">Aris</span>
        <button
          type="button"
          className="aris-mute-btn"
          onClick={toggleMute}
          aria-label={isMuted ? 'Activar voz' : 'Silenciar voz'}
          title={isMuted ? 'Activar voz' : 'Silenciar voz'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          className="aris-close-btn"
          onClick={close}
          aria-label="Cerrar mensaje"
        >
          ✕
        </button>
      </div>
      <p className="aris-bubble-text">{message.replace(/^Aris:\s*/i, '')}</p>
    </aside>
  )
}

export function ArisPrompt() {
  const isOpen = useStore((s) => s.arisPromptOpen)
  const setOpen = useStore((s) => s.setArisPromptOpen)
  const askAris = useStore((s) => s.askAris)
  const isMuted = useStore((s) => s.arisMuted)
  const toggleMute = useStore((s) => s.toggleArisMute)
  const [query, setQuery] = useState('')

  const handleFinalResult = (transcript: string) => {
    if (!transcript) return
    askAris(transcript)
    setQuery('')
    pointerLock.lock()
  }

  const {
    isSupported,
    isListening,
    interimText,
    errorStatus,
    toggleListening,
    stopListening,
  } = useSpeechRecognition({
    onFinalResult: handleFinalResult,
    autoSendDelayMs: 400,
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    stopListening()
    const text = (isListening && interimText ? interimText : query).trim()
    if (!text) return
    askAris(text)
    setQuery('')
    pointerLock.lock()
  }

  const cancel = () => {
    stopListening()
    setOpen(false)
    pointerLock.lock()
  }

  if (!isOpen) return null

  const displayValue = isListening && interimText ? interimText : query

  let placeholder = 'Escribe tu pregunta a Aris...'
  if (isListening) {
    placeholder = interimText || 'Escuchando tu voz...'
  } else if (errorStatus === 'not-allowed') {
    placeholder = 'Micrófono bloqueado (permite acceso)'
  } else if (errorStatus === 'no-speech') {
    placeholder = 'No se detectó audio, intenta de nuevo'
  }

  return (
    <div className="aris-modal-overlay">
      <form className="aris-modal" onSubmit={submit}>
        <div className="aris-modal-header">
          <span className="aris-avatar">🤖</span>
          <div>
            <h3>Consultar a Aris</h3>
            <p className="aris-modal-sub">
              Pregúntale qué falta memorizar, adónde ir o pistas sobre la sala.
            </p>
          </div>
          <button
            type="button"
            className="aris-mute-btn"
            onClick={toggleMute}
            aria-label={isMuted ? 'Activar voz' : 'Silenciar voz'}
            title={isMuted ? 'Activar voz' : 'Silenciar voz'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="aris-close-btn" onClick={cancel}>
            ✕
          </button>
        </div>

        <div className="aris-input-row">
          <input
            autoFocus
            type="text"
            className="aris-input"
            value={displayValue}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            disabled={isListening}
          />
          {isSupported && (
            <button
              type="button"
              className={`aris-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleListening}
              title={isListening ? 'Detener dictado' : 'Dictar por voz'}
            >
              🎤
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={isListening && !interimText}>
            Preguntar
          </button>
        </div>

        <div className="aris-quick-pills">
          <button
            type="button"
            className="pill"
            onClick={() => {
              stopListening()
              askAris('¿Qué falta memorizar?')
              pointerLock.lock()
            }}
          >
            ¿Qué falta memorizar?
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => {
              stopListening()
              askAris('¿Adónde voy ahora?')
              pointerLock.lock()
            }}
          >
            ¿Adónde voy ahora?
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => {
              stopListening()
              askAris('¿De qué trata esta sala?')
              pointerLock.lock()
            }}
          >
            Resumen de sala
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => {
              stopListening()
              askAris('¿Dónde está la llave?')
              pointerLock.lock()
            }}
          >
            ¿Dónde está la llave?
          </button>
        </div>
      </form>
    </div>
  )
}

import { useDeferredValue, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { countSources, type Museum } from '@mus3o/shared'
import { generateMuseum } from '../lib/api'
import { dungeonDemoMuseum } from '../mocks/dungeon'
import { EXAMPLE_TEXT } from '../palace/example'
import { buildLayout } from '../palace/layout'
import { detectFormat, MAX_INPUT_CHARS, parsePalace } from '../palace/parse'
import { dueCountFor } from '../memory/hooks'
import { useStore } from '../store'
import { FreeExploreToggle } from './FreeExploreToggle'

// La maqueta 3D se carga aparte para que three.js no bloquee la primera pintura de la landing.
const Preview = lazy(() => import('../scene/Preview').then((m) => ({ default: m.Preview })))

const PLACEHOLDER = ['# Tema 1', '- Concepto A: explicación', '- Concepto B', '', '# Tema 2', '- Concepto C'].join(String.fromCharCode(10))
const MAX_FILE_BYTES = 200_000

/** "17 de 17 conceptos verificados en tus apuntes" o "15 de 17 · 2 sin fuente". */
export function sourceSummary(palace: Museum): string {
  const { total, verified, unverified } = countSources(palace)
  return unverified === 0
    ? `${verified} de ${total} conceptos verificados en tus apuntes`
    : `${verified} de ${total} · ${unverified} sin fuente`
}

export function Landing() {
  const enterPalace = useStore((s) => s.enterPalace)
  const resume = useStore((s) => s.resume)
  const saved = useStore((s) => s.palace)
  const [input, setInput] = useState(EXAMPLE_TEXT)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [aiState, setAiState] = useState<'idle' | 'loading'>('idle')
  const [aiError, setAiError] = useState<string | null>(null)
  // Palacio generado con IA a la espera de entrar: deja ver cuántos conceptos se verificaron.
  const [aiResult, setAiResult] = useState<{ palace: Museum; text: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const generateWithAi = async () => {
    if (!input.trim() || aiState === 'loading') return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAiError(null)
    setAiResult(null)
    setAiState('loading')
    try {
      const palace = await generateMuseum(input, controller.signal)
      const { verified, unverified } = countSources(palace)
      if (verified + unverified === 0) enterPalace(palace)
      else setAiResult({ palace, text: input.trim() })
    } catch (e) {
      if (controller.signal.aborted) return
      const status = (e as { status?: number }).status
      setAiError(
        status === 503
          ? 'La IA no está configurada en el servidor. Puedes construir el palacio sin IA.'
          : status === 429
            ? 'Demasiadas solicitudes. Intenta en un minuto.'
            : 'No pudimos generar el palacio con IA. Intenta de nuevo o constrúyelo sin IA.',
      )
    } finally {
      if (!controller.signal.aborted) setAiState('idle')
    }
  }

  const deferred = useDeferredValue(input)
  // El formato se detecta solo: un JSON pegado (p. ej. un palacio exportado) se sigue aceptando.
  const result = useMemo(() => parsePalace(deferred, detectFormat(deferred)), [deferred])
  const layout = useMemo(() => (result.ok ? buildLayout(result.palace) : null), [result])
  const conceptCount = result.ok ? result.palace.rooms.reduce((n, r) => n + r.pieces.length, 0) : 0

  const onFile = async (file: File | undefined) => {
    setFileError(null)
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setFileError('El archivo pesa más de 200 KB.')
      return
    }
    const text = await file.text()
    setInput(text)
  }

  return (
    <main className="landing">
      <section className="landing-left">
        <p className="brand">mus3o</p>
        <h1>Un lugar para cada idea</h1>
        <p className="lead">
          Camillo, en el siglo XVI, guardó el saber en los asientos de un teatro. Pega tus apuntes y mus3o levanta uno:
          cada tema es una sala de un solo color, cada concepto un objeto de yeso sobre su pedestal.
        </p>

        <div className="editor">
          <div className="tabs">
            <span className="tab active">Tus apuntes</span>
            <button className="tab tab-file" onClick={() => fileRef.current?.click()}>
              Subir archivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setAiResult(null) }}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            maxLength={MAX_INPUT_CHARS}
            aria-label="Apuntes"
          />
          <div className="editor-status">
            {aiError ? (
              <span className="error">{aiError}</span>
            ) : fileError ? (
              <span className="error">{fileError}</span>
            ) : aiResult ? (
              <span>{sourceSummary(aiResult.palace)}</span>
            ) : result.ok ? (
              <span>
                {result.palace.rooms.length} salas · {conceptCount} conceptos
                {result.warnings.length > 0 && <span className="warn"> · {result.warnings[0]}</span>}
              </span>
            ) : (
              <span className="error">{result.error}</span>
            )}
          </div>
        </div>

        <div className="actions">
          {aiResult && (
            <button className="btn btn-primary btn-lg" onClick={() => enterPalace(aiResult.palace, aiResult.text)}>
              Entrar al palacio
            </button>
          )}
          <button className={aiResult ? 'btn' : 'btn btn-primary btn-lg'} disabled={!result.ok} onClick={() => result.ok && enterPalace(result.palace, input)}>
            Construir palacio
          </button>
          <button className="btn" disabled={!input.trim() || aiState === 'loading'} onClick={generateWithAi}>
            {aiState === 'loading' ? 'Levantando muros…' : 'Generar con IA'}
          </button>
          <button className="btn btn-ghost" onClick={() => setInput(EXAMPLE_TEXT)}>
            Usar ejemplo: Biología celular
          </button>
          <button className="btn btn-ghost" onClick={() => enterPalace(dungeonDemoMuseum)}>
            Explorar Mazmorra
          </button>
          {saved && (
            <button className="btn btn-ghost" onClick={resume}>
              Continuar “{saved.title}”
              {dueCountFor(saved) > 0 && (
                <span className="due-chip"> · {dueCountFor(saved)} {dueCountFor(saved) === 1 ? 'repaso pendiente' : 'repasos pendientes'}</span>
              )}
            </button>
          )}
        </div>
        <FreeExploreToggleConnected />
      </section>

      <section className="landing-right" aria-label="Vista previa del palacio">
        <div className="preview-frame">
          <Suspense fallback={null}>
            <Preview layout={layout} />
          </Suspense>
          {aiState === 'loading' && (
            <div className="preview-loading" role="status">
              <span className="bricks" aria-hidden>
                <i /><i /><i /><i /><i /><i />
              </span>
              <p>Levantando muros…</p>
              <p className="sub">La IA modela un objeto para cada concepto.</p>
            </div>
          )}
        </div>
        <div className="plinth">
          <p className="plinth-title">Maqueta del palacio</p>
          <p className="plinth-sub">Se levanta de nuevo cada vez que cambias el texto.</p>
        </div>
      </section>
    </main>
  )
}

function FreeExploreToggleConnected() {
  const freeExplore = useStore((s) => s.freeExplore)
  const setFreeExplore = useStore((s) => s.setFreeExplore)
  return <FreeExploreToggle checked={freeExplore} onChange={setFreeExplore} />
}

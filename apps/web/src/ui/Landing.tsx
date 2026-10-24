import { useDeferredValue, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { generateMuseum } from '../lib/api'
import { dungeonDemoMuseum } from '../mocks/dungeon'
import { EXAMPLE_TEXT } from '../palace/example'
import { buildLayout } from '../palace/layout'
import { detectFormat, MAX_INPUT_CHARS, parsePalace, type InputFormat } from '../palace/parse'
import { dueCountFor } from '../memory/hooks'
import { useStore } from '../store'

// La maqueta 3D se carga aparte para que three.js no bloquee la primera pintura de la landing.
const Preview = lazy(() => import('../scene/Preview').then((m) => ({ default: m.Preview })))

const FORMATS: { id: InputFormat; label: string; placeholder: string }[] = [
  { id: 'text', label: 'Texto', placeholder: '# Tema 1\n- Concepto A: explicación\n- Concepto B\n\n# Tema 2\n- Concepto C' },
  { id: 'json', label: 'JSON', placeholder: '{\n  "Tema 1": ["Concepto A", "Concepto B"],\n  "Tema 2": { "Concepto C": "explicación" }\n}' },
  { id: 'csv', label: 'CSV', placeholder: 'sala,concepto,detalle\nTema 1,Concepto A,explicación\nTema 2,Concepto C,explicación' },
]
const MAX_FILE_BYTES = 200_000

export function Landing() {
  const enterPalace = useStore((s) => s.enterPalace)
  const resume = useStore((s) => s.resume)
  const saved = useStore((s) => s.palace)
  const [input, setInput] = useState(EXAMPLE_TEXT)
  const [format, setFormat] = useState<InputFormat>('text')
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [aiState, setAiState] = useState<'idle' | 'loading'>('idle')
  const [aiError, setAiError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const generateWithAi = async () => {
    if (!input.trim() || aiState === 'loading') return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAiError(null)
    setAiState('loading')
    try {
      enterPalace(await generateMuseum(input, controller.signal))
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
  const result = useMemo(() => parsePalace(deferred, format), [deferred, format])
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
    setFormat(file.name.endsWith('.json') ? 'json' : file.name.endsWith('.csv') ? 'csv' : detectFormat(text))
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
          <div className="tabs" role="tablist">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={format === f.id}
                className={format === f.id ? 'tab active' : 'tab'}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </button>
            ))}
            <button className="tab tab-file" onClick={() => fileRef.current?.click()}>
              Subir archivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.json,.csv"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={FORMATS.find((f) => f.id === format)!.placeholder}
            spellCheck={false}
            maxLength={MAX_INPUT_CHARS}
            aria-label="Apuntes"
          />
          <div className="editor-status">
            {aiError ? (
              <span className="error">{aiError}</span>
            ) : fileError ? (
              <span className="error">{fileError}</span>
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
          <button className="btn btn-primary btn-lg" disabled={!result.ok} onClick={() => result.ok && enterPalace(result.palace)}>
            Construir palacio
          </button>
          <button className="btn" disabled={!input.trim() || aiState === 'loading'} onClick={generateWithAi}>
            {aiState === 'loading' ? 'Levantando muros…' : 'Generar con IA'}
          </button>
          <button className="btn btn-ghost" onClick={() => { setInput(EXAMPLE_TEXT); setFormat('text') }}>
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

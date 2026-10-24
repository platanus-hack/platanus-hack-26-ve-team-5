import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { EXAMPLE_TEXT } from '../palace/example'
import { buildLayout } from '../palace/layout'
import { detectFormat, parsePalace, type InputFormat } from '../palace/parse'
import { LIMITS } from '../palace/schema'
import { Preview } from '../scene/Preview'
import { useStore } from '../store'

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

  const deferred = useDeferredValue(input)
  const result = useMemo(() => parsePalace(deferred, format), [deferred, format])
  const layout = useMemo(() => (result.ok ? buildLayout(result.palace) : null), [result])
  const conceptCount = result.ok ? result.palace.rooms.reduce((n, r) => n + r.concepts.length, 0) : 0

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
        <p className="brand">
          <span className="brand-mark" aria-hidden /> LociGen
        </p>
        <h1>
          Convierte tus apuntes en un <em>palacio de la memoria</em>
        </h1>
        <p className="lead">
          Pega tus apuntes y generamos un museo 3D que recorres en primera persona. Cada tema es una sala, cada
          concepto un pedestal. Tu cerebro recuerda lugares mejor que listas.
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
            maxLength={LIMITS.maxInputChars}
            aria-label="Apuntes"
          />
          <div className="editor-status">
            {fileError ? (
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
          <button className="btn btn-ghost" onClick={() => { setInput(EXAMPLE_TEXT); setFormat('text') }}>
            Usar ejemplo: Biología celular
          </button>
          {saved && (
            <button className="btn btn-ghost" onClick={resume}>
              Continuar “{saved.title}”
            </button>
          )}
        </div>
      </section>

      <section className="landing-right" aria-label="Vista previa del palacio">
        <div className="preview-frame">
          <Preview layout={layout} />
          <p className="preview-caption">Vista previa en vivo · se reconstruye mientras escribes</p>
        </div>
      </section>
    </main>
  )
}

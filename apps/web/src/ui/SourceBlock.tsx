import { useMemo } from 'react'
import type { Piece } from '@mus3o/shared'
import { sourceView } from '../palace/sources'
import { useStore } from '../store'

/** Bajo el texto del concepto: de qué parte de los apuntes del usuario sale (o aviso de que no está). */
export function SourceBlock({ concept }: { concept: Piece }) {
  const sourceText = useStore((s) => s.sourceText)
  const view = useMemo(
    () => (concept.source ? sourceView(sourceText, concept.source) : null),
    [sourceText, concept.source],
  )

  if (view) {
    return (
      <div className="card-source">
        <p className="card-source-head">De tus apuntes{view.line ? ` · Línea ${view.line}` : ''}</p>
        {view.context && <p className="card-source-context">{view.context}</p>}
        <p className="card-source-quote">
          {view.pre}
          <mark>{view.mark}</mark>
          {view.post}
        </p>
      </div>
    )
  }
  if (concept.unverified) {
    return (
      <div className="card-source card-source-warn">
        <p className="card-source-head">Sin fuente</p>
        <p className="card-source-quote">No encontramos esta idea en tus apuntes</p>
      </div>
    )
  }
  return null
}

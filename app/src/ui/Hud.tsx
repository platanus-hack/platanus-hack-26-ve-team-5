import { useState } from 'react'
import type { PalaceLayout } from '../palace/layout'
import { isCorrectAnswer } from '../palace/match'
import type { Concept } from '../palace/schema'
import { pointerLock } from '../scene/Player'
import { allConcepts, useStore } from '../store'
import { Minimap } from './Minimap'

function findConcept(layout: PalaceLayout, id: string | null) {
  for (const r of layout.rooms) {
    const p = r.pedestals.find((x) => x.concept.id === id)
    if (p) return { concept: p.concept, room: r }
  }
  return null
}

function ConceptCard({ concept, color }: { concept: Concept; color: string }) {
  const memorized = useStore((s) => !!s.memorized[concept.id])
  return (
    <aside className="card" style={{ '--accent': color } as React.CSSProperties}>
      <p className="eyebrow">Concepto</p>
      <h2>{concept.title}</h2>
      {concept.detail && <p className="card-body">{concept.detail}</p>}
      {concept.metaphor && <p className="card-meta">Metáfora: {concept.metaphor}</p>}
      <div className="card-actions">
        <span className={memorized ? 'pill pill-gold' : 'pill'}>{memorized ? '★ Memorizado' : 'Sin memorizar'}</span>
        <span className="keys">
          <kbd>M</kbd> marcar · <kbd>E</kbd> cerrar
        </span>
      </div>
    </aside>
  )
}

function ExamCard({ concept, color }: { concept: Concept; color: string }) {
  const result = useStore((s) => s.exam[concept.id])
  const recordExam = useStore((s) => s.recordExam)
  const [answer, setAnswer] = useState('')
  const [hint, setHint] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!answer.trim()) return
    recordExam(concept.id, isCorrectAnswer(answer, concept.title) ? 'ok' : 'fail')
  }
  const back = () => {
    useStore.getState().set({ openId: null })
    pointerLock.lock()
  }

  return (
    <aside className="card card-exam" style={{ '--accent': color } as React.CSSProperties}>
      <p className="eyebrow">Modo examen</p>
      {!result ? (
        <form onSubmit={submit}>
          <h2>¿Qué concepto estaba en este pedestal?</h2>
          {concept.detail && <p className="card-body">Pista del contenido: “{concept.detail}”</p>}
          {hint && <p className="card-meta">Empieza con “{concept.title.slice(0, 2)}…” · {concept.title.length} letras</p>}
          <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Escribe tu respuesta" maxLength={120} />
          <div className="card-actions">
            <button type="submit" className="btn btn-primary">Responder</button>
            {!hint && <button type="button" className="btn btn-ghost" onClick={() => setHint(true)}>Pista</button>}
          </div>
        </form>
      ) : (
        <>
          <h2 className={result === 'ok' ? 'ok' : 'fail'}>{result === 'ok' ? '+1 · ¡Recordado!' : 'No era eso'}</h2>
          <p className="card-body">
            Respuesta: <strong>{concept.title}</strong>
          </p>
          <div className="card-actions">
            <button className="btn btn-primary" onClick={back}>Seguir recorriendo</button>
          </div>
        </>
      )}
    </aside>
  )
}

export function Hud({ layout }: { layout: PalaceLayout }) {
  const palace = useStore((s) => s.palace)
  const mode = useStore((s) => s.mode)
  const locked = useStore((s) => s.locked)
  const memorized = useStore((s) => s.memorized)
  const exam = useStore((s) => s.exam)
  const currentRoomId = useStore((s) => s.currentRoomId)
  const focusedId = useStore((s) => s.focusedId)
  const openId = useStore((s) => s.openId)
  const setMode = useStore((s) => s.setMode)
  const exitToLanding = useStore((s) => s.exitToLanding)

  const room = layout.rooms.find((r) => r.id === currentRoomId) ?? layout.rooms[0]
  const total = allConcepts(palace).length
  const memorizedCount = Object.keys(memorized).length
  const answered = Object.values(exam)
  const score = answered.filter((r) => r === 'ok').length
  const open = findConcept(layout, openId)
  const examFinished = mode === 'exam' && answered.length === total && total > 0

  return (
    <div className="hud">
      <div className="hud-room" style={{ '--accent': room.color } as React.CSSProperties}>
        <span className="chip" />
        <div>
          <p className="eyebrow">Sala {room.index + 1} de {layout.rooms.length}</p>
          <p className="hud-room-title">{room.title}</p>
        </div>
      </div>

      <div className="hud-right">
        <Minimap layout={layout} />
        <p className="hud-progress">
          {mode === 'explore' ? (
            <>★ {memorizedCount}/{total} memorizados</>
          ) : (
            <>Examen · {score}/{answered.length} correctas · {total - answered.length} restantes</>
          )}
        </p>
      </div>

      {locked && <div className="crosshair" />}
      {locked && focusedId && !openId && (
        <p className="hint">
          <kbd>E</kbd> {mode === 'exam' && !exam[focusedId] ? 'Responder' : 'Examinar concepto'}
        </p>
      )}

      {open && (mode === 'explore' ? (
        <ConceptCard concept={open.concept} color={open.room.color} />
      ) : (
        <ExamCard key={open.concept.id} concept={open.concept} color={open.room.color} />
      ))}

      <p className="hud-legend">
        <kbd>W A S D</kbd> moverse · <kbd>Shift</kbd> correr · <kbd>Mouse</kbd> mirar · <kbd>Esc</kbd> pausa
      </p>

      {!locked && !(mode === 'exam' && open) && (
        <div className="pause">
          <div className="pause-panel">
            <p className="eyebrow">{palace?.title}</p>
            <h1>{examFinished ? `Resultado: ${score}/${total}` : mode === 'exam' ? 'Modo examen' : 'Tu palacio está listo'}</h1>
            <p className="muted">
              {mode === 'exam'
                ? 'Los carteles están ocultos. Acércate a cada pedestal y recuerda qué concepto había.'
                : 'Camina por las salas, examina cada pedestal y marca lo que ya memorizaste.'}
            </p>
            <div className="pause-actions">
              <button className="btn btn-primary" onClick={() => pointerLock.lock()}>
                {mode === 'exam' ? 'Empezar examen' : 'Entrar al palacio'}
              </button>
              <button className="btn btn-ghost" onClick={() => setMode(mode === 'exam' ? 'explore' : 'exam')}>
                {mode === 'exam' ? 'Volver a explorar' : 'Modo examen'}
              </button>
              <button className="btn btn-ghost" onClick={exitToLanding}>Editar apuntes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { PalaceLayout } from '../palace/layout'
import { isCorrectAnswer } from '../palace/match'
import { pieceKind } from '../palace/pieceKind'
import type { Piece as Concept } from '@mus3o/shared'
import { creditLine, useResolvedImage } from '../lib/images'
import { pointerLock } from '../scene/pointerLock'
import { allConcepts, useStore } from '../store'
import { roomPalettes, DEFAULT_THEME, type RoomPalette } from '../theme'
import { Minimap } from './Minimap'
import { SourceBlock } from './SourceBlock'

function wallVars(p: RoomPalette) {
  return { '--wall': p.wall, '--wall-ink': p.ink } as React.CSSProperties
}

function findConcept(layout: PalaceLayout, id: string | null) {
  for (const r of layout.rooms) {
    const p = r.pedestals.find((x) => x.concept.id === id)
    if (p) return { concept: p.concept, room: r }
  }
  return null
}

function ConceptCard({ concept, palette, roomName }: { concept: Concept; palette: RoomPalette; roomName: string }) {
  const memorized = useStore((s) => !!s.memorized[concept.id])
  const image = useResolvedImage(concept.imageSearch)
  return (
    <aside className="card" style={wallVars(palette)}>
      <p className="card-tag">{roomName}</p>
      <div className="card-inner">
        <h2>{concept.title}</h2>
        {concept.text && <p className="card-body">{concept.text}</p>}
        {concept.fact && <p className="card-meta">{concept.fact}</p>}
        <SourceBlock concept={concept} />
        {image && (
          <figure className="card-figure">
            <img src={image.src} alt={image.title} loading="lazy" />
            <figcaption>{creditLine(image)}</figcaption>
          </figure>
        )}
        <div className="card-actions">
          <span className={memorized ? 'pill pill-gold' : 'pill'}>{memorized ? 'Memorizado' : 'Sin memorizar'}</span>
          <span className="keys">
            <kbd>M</kbd> marcar · <kbd>E</kbd> cerrar
          </span>
        </div>
      </div>
    </aside>
  )
}

function ExamCard({ concept, palette }: { concept: Concept; palette: RoomPalette }) {
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
    <aside className="card card-exam" style={wallVars(palette)}>
      <p className="card-tag">Modo examen</p>
      <div className="card-inner">
        {!result ? (
          <form onSubmit={submit}>
            <h2>¿Qué concepto estaba en este pedestal?</h2>
            {concept.text && <p className="card-body">Pista del contenido: “{concept.text}”</p>}
            {hint && <p className="card-meta">Empieza con “{concept.title.slice(0, 2)}…” · {concept.title.length} letras</p>}
            <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Escribe tu respuesta" maxLength={120} aria-label="Tu respuesta" />
            <div className="card-actions">
              <button type="submit" className="btn btn-primary">Responder</button>
              {!hint && <button type="button" className="btn btn-ghost" onClick={() => setHint(true)}>Ver pista</button>}
            </div>
          </form>
        ) : (
          <>
            <h2 className={result === 'ok' ? 'ok' : 'fail'}>{result === 'ok' ? 'Recordado' : 'No era ese'}</h2>
            <p className="card-body">
              Respuesta: <strong>{concept.title}</strong>
            </p>
            <div className="card-actions">
              <button className="btn btn-primary" onClick={back}>Seguir recorriendo</button>
            </div>
          </>
        )}
      </div>
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
  const focusedDoorId = useStore((s) => s.focusedDoorId)
  const hasKey = useStore((s) => s.hasKey)
  const unlockedDoors = useStore((s) => s.unlockedDoors)
  const openId = useStore((s) => s.openId)
  const setMode = useStore((s) => s.setMode)
  const exitToLanding = useStore((s) => s.exitToLanding)

  const room = layout.rooms.find((r) => r.id === currentRoomId) ?? layout.rooms[0]
  const total = allConcepts(palace).length
  const memorizedCount = Object.keys(memorized).length
  const answered = Object.values(exam)
  const score = answered.filter((r) => r === 'ok').length
  const palettes = roomPalettes(DEFAULT_THEME, layout.rooms.map((r) => r.title))
  const palette = palettes[room.index]
  const open = findConcept(layout, openId)
  const focused = findConcept(layout, focusedId)
  const focusedKind = focused ? pieceKind(focused.concept) : 'standard'
  const examFinished = mode === 'exam' && answered.length === total && total > 0

  return (
    <div className="hud">
      <div className="plaque" style={wallVars(palette)}>
        <p className="plaque-meta">Sala {room.index + 1} de {layout.rooms.length} · {palette.name}</p>
        <p className="plaque-title">{room.title}</p>
      </div>

      <div className="hud-right">
        <Minimap layout={layout} />
        {hasKey && (
          <div className="key-badge">
            🗝️ Llave en inventario
          </div>
        )}
        <p className="hud-progress">
          {mode === 'explore' ? (
            <>{memorizedCount} de {total} memorizados</>
          ) : (
            <>Examen: {score} de {answered.length} correctas, faltan {total - answered.length}</>
          )}
        </p>
      </div>

      {locked && <div className="crosshair" />}
      {locked && focusedDoorId && !unlockedDoors[focusedDoorId] && (
        <p className={`hint ${hasKey ? 'hint-gold' : 'hint-warn'}`}>
          {hasKey ? (
            <>
              <kbd>E</kbd> Usar llave para abrir compuerta
            </>
          ) : (
            <>🔒 Compuerta de mazmorra bloqueada (necesitas la llave)</>
          )}
        </p>
      )}
      {locked && (!focusedDoorId || unlockedDoors[focusedDoorId]) && focusedId && !openId && (
        <p className="hint">
          <kbd>E</kbd>{' '}
          {focusedKind === 'key'
            ? hasKey
              ? 'Examinar Llave de Hierro'
              : 'Recoger Llave de Hierro'
            : mode === 'exam' && !exam[focusedId]
              ? 'Responder'
              : 'Examinar concepto'}
        </p>
      )}

      {open && (mode === 'explore' ? (
        <ConceptCard concept={open.concept} palette={palettes[open.room.index]} roomName={open.room.title} />
      ) : (
        <ExamCard key={open.concept.id} concept={open.concept} palette={palettes[open.room.index]} />
      ))}

      <p className="hud-legend">
        <kbd>W A S D</kbd> moverse · <kbd>Shift</kbd> correr · <kbd>Mouse</kbd> mirar · <kbd>Esc</kbd> pausa
      </p>

      {!locked && !(mode === 'exam' && open) && (
        <div className="pause">
          <div className="pause-panel">
            <p className="pause-sub">{palace?.title}</p>
            <h1>{examFinished ? `Resultado: ${score} de ${total}` : mode === 'exam' ? 'Modo examen' : 'Tu palacio está levantado'}</h1>
            <p className="muted">
              {mode === 'exam'
                ? 'Los carteles están ocultos. Acércate a cada pedestal y di qué concepto había.'
                : 'Camina por las salas, examina cada pedestal y marca lo que ya recuerdas.'}
            </p>
            <div className="pause-actions">
              <button className="btn btn-primary" onClick={() => pointerLock.lock()}>
                {mode === 'exam' ? 'Empezar examen' : 'Entrar al palacio'}
              </button>
              <button className="btn btn-ghost" onClick={() => setMode(mode === 'exam' ? 'explore' : 'exam')}>
                {mode === 'exam' ? 'Volver a explorar' : 'Empezar modo examen'}
              </button>
              <button className="btn btn-ghost" onClick={exitToLanding}>Editar apuntes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

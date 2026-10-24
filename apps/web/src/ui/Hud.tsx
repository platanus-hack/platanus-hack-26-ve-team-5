import { useMemo, useState } from 'react'
import type { PalaceLayout } from '../palace/layout'
import { isCorrectAnswer } from '../palace/match'
import { pieceKind } from '../palace/pieceKind'
import type { Piece as Concept } from '@mus3o/shared'
import { creditLine, useResolvedImage } from '../lib/images'
import { pointerLock } from '../scene/pointerLock'
import { useDueCount, useRoomMemory } from '../memory/hooks'
import { TIME_STEPS } from '../memory/model'
import { useMemory } from '../memory/store'
import { allConcepts, inExamScope, useStore } from '../store'
import { roomPalettes, DEFAULT_THEME, type RoomPalette } from '../theme'
import { Minimap } from './Minimap'

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
  const reviewIds = useStore((s) => s.reviewIds)
  const startReview = useStore((s) => s.startReview)
  const exitToLanding = useStore((s) => s.exitToLanding)

  const room = layout.rooms.find((r) => r.id === currentRoomId) ?? layout.rooms[0]
  const total = reviewIds?.length ?? allConcepts(palace).length
  const conceptCount = allConcepts(palace).length
  const memorizedCount = Object.keys(memorized).length
  const answered = Object.values(exam)
  const score = answered.filter((r) => r === 'ok').length
  const palettes = roomPalettes(DEFAULT_THEME, layout.rooms.map((r) => r.title))
  const palette = palettes[room.index]
  const open = findConcept(layout, openId)
  const focused = findConcept(layout, focusedId)
  const focusedKind = focused ? pieceKind(focused.concept) : 'standard'
  const examFinished = mode === 'exam' && answered.length === total && total > 0
  const roomIds = useMemo(() => room.pedestals.map((p) => p.concept.id), [room])
  const roomMem = useRoomMemory(roomIds)
  const due = useDueCount()
  const offsetDays = useMemory((s) => s.timeOffsetDays)
  const setOffset = useMemory((s) => s.setOffset)

  return (
    <div className="hud">
      <div className="plaque" style={wallVars(palette)}>
        <p className="plaque-meta">Sala {room.index + 1} de {layout.rooms.length} · {palette.name}</p>
        <p className="plaque-title">{room.title}</p>
        <p className="plaque-memory">
          {roomMem.learned ? `Memoria de la sala: ${Math.round(roomMem.strength * 100)}%` : 'Sala sin estudiar todavía'}
        </p>
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
            <>{memorizedCount} de {conceptCount} memorizados</>
          ) : (
            <>Examen: {score} de {answered.length} correctas, faltan {total - answered.length}</>
          )}
        </p>
        <p className={due > 0 ? 'hud-due hud-due-on' : 'hud-due'}>Repasos pendientes: {due}</p>
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
            : inExamScope({ mode, reviewIds }, focusedId) && !exam[focusedId]
              ? 'Responder'
              : 'Examinar concepto'}
        </p>
      )}

      {open && (!inExamScope({ mode, reviewIds }, open.concept.id) ? (
        <ConceptCard concept={open.concept} palette={palettes[open.room.index]} roomName={open.room.title} />
      ) : (
        <ExamCard key={open.concept.id} concept={open.concept} palette={palettes[open.room.index]} />
      ))}

      <p className="hud-legend">
        <kbd>W A S D</kbd> moverse · <kbd>Shift</kbd> correr · <kbd>Mouse</kbd> mirar · <kbd>Esc</kbd> pausa
      </p>

      {!locked && !(open && inExamScope({ mode, reviewIds }, open.concept.id)) && (
        <div className="pause">
          <div className="pause-panel">
            <p className="pause-sub">{palace?.title}</p>
            <h1>{examFinished ? `Resultado: ${score} de ${total}` : reviewIds ? 'Repaso' : mode === 'exam' ? 'Modo examen' : 'Tu palacio está levantado'}</h1>
            <p className="muted">
              {mode === 'exam'
                ? reviewIds
                  ? 'Solo se preguntan los conceptos que se están olvidando. Acércate a cada pedestal roto y di qué había.'
                  : 'Los carteles están ocultos. Acércate a cada pedestal y di qué concepto había.'
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

            <div className="memory-panel">
              <button
                className="btn btn-primary"
                disabled={due === 0}
                onClick={() => {
                  if (startReview()) pointerLock.lock()
                }}
              >
                Repasar lo pendiente{due > 0 ? ` (${due})` : ''}
              </button>
              {due === 0 && <p className="muted memory-note">Nada que repasar por ahora. Marca conceptos con M para que el palacio los recuerde.</p>}
              <fieldset className="time-machine">
                <legend>Simular el paso del tiempo</legend>
                <div className="time-steps" role="group" aria-label="Días simulados">
                  {TIME_STEPS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={offsetDays === d ? 'btn btn-step is-on' : 'btn btn-step'}
                      aria-pressed={offsetDays === d}
                      onClick={() => setOffset(d)}
                    >
                      {d === 0 ? 'Hoy' : `${d} ${d === 1 ? 'día' : 'días'}`}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={Math.min(offsetDays, 30)}
                  onChange={(e) => setOffset(Number(e.target.value))}
                  aria-label="Días que han pasado"
                />
                <p className="muted memory-note">{offsetDays === 0 ? 'Es hoy.' : `Han pasado ${offsetDays} ${offsetDays === 1 ? 'día' : 'días'}.`}</p>
              </fieldset>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

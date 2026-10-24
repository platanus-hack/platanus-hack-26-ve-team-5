import { useEffect, useMemo } from 'react'
import { canOpenDoor, remainingToMemorize } from '../palace/keys'
import type { PalaceLayout } from '../palace/layout'
import { pieceKind } from '../palace/pieceKind'
import type { Piece as Concept } from '@mus3o/shared'
import { creditLine, prefetchPalaceImages, useResolvedImage } from '../lib/images'
import { pointerLock } from '../scene/pointerLock'
import { useDueCount, useRoomMemory } from '../memory/hooks'
import { TIME_STEPS } from '../memory/model'
import { useMemory } from '../memory/store'
import { conceptIdList } from '../palace/conceptIds'
import { inExamScope, isDoorOpen, useStore } from '../store'
import { roomPalettes, DEFAULT_THEME, type RoomPalette } from '../theme'
import { FreeExploreToggle } from './FreeExploreToggle'
import { DioramaMinimap } from '../diorama/DioramaMinimap'
import { useDioramaStore } from '../diorama/dioramaStore'
import { ArisDialog, ArisPrompt } from './ArisDialog'
import { ExamCard } from './ExamCard'
import { Minimap } from './Minimap'
import { Narrator } from './Narrator'
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
        {concept.mnemonicCue ? (
          <div className="card-cue">
            <span className="card-cue-badge">Anclaje Mnemotécnico</span>
            <p className="card-cue-text">{concept.mnemonicCue}</p>
          </div>
        ) : concept.fact ? (
          <p className="card-meta">{concept.fact}</p>
        ) : null}
        <SourceBlock concept={concept} />
        {image && (
          <figure className="card-figure">
            <img src={image.src} alt={image.title} width={image.width} height={image.height} decoding="async" />
            <figcaption>{creditLine(image)}</figcaption>
          </figure>
        )}
        {/* Mientras se resuelve, reserva el lugar para que la ficha no salte. */}
        {image === undefined && <div className="card-figure card-figure-loading" aria-hidden />}
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

export function Hud({ layout }: { layout: PalaceLayout }) {
  const palace = useStore((s) => s.palace)
  // Precarga las imágenes de todo el palacio para que las fichas se abran al instante.
  useEffect(() => {
    if (palace) void prefetchPalaceImages(palace)
  }, [palace])
  const mode = useStore((s) => s.mode)
  const locked = useStore((s) => s.locked)
  const memorized = useStore((s) => s.memorized)
  const exam = useStore((s) => s.exam)
  const currentRoomId = useStore((s) => s.currentRoomId)
  const inDiorama = useDioramaStore((s) => s.phase === 'inside' || s.phase === 'leaving')
  const arisAvailable = useDioramaStore((s) => s.phase === 'room')
  const focusedId = useStore((s) => s.focusedId)
  const focusedDoorId = useStore((s) => s.focusedDoorId)
  const hasKey = useStore((s) => s.hasKey)
  const unlockedDoors = useStore((s) => s.unlockedDoors)
  const freeExplore = useStore((s) => s.freeExplore)
  const setFreeExplore = useStore((s) => s.setFreeExplore)
  const doorOpen = (id: string) => isDoorOpen({ freeExplore, unlockedDoors }, id)
  const roomKeys = useStore((s) => s.roomKeys)
  const lastKeyRoomId = useStore((s) => s.lastKeyRoomId)
  const setState = useStore((s) => s.set)
  const openId = useStore((s) => s.openId)
  const setMode = useStore((s) => s.setMode)
  const reviewIds = useStore((s) => s.reviewIds)
  const startReview = useStore((s) => s.startReview)
  const exitToLanding = useStore((s) => s.exitToLanding)

  const room = layout.rooms.find((r) => r.id === currentRoomId) ?? layout.rooms[0]
  const conceptCount = conceptIdList(palace).length
  const total = reviewIds?.length ?? conceptCount
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

  // Aviso de llave ganada: se muestra unos segundos.
  useEffect(() => {
    if (!lastKeyRoomId) return
    const timer = setTimeout(() => setState({ lastKeyRoomId: null }), 4000)
    return () => clearTimeout(timer)
  }, [lastKeyRoomId, setState])

  const focusedDoor = layout.doors.find((d) => d.id === focusedDoorId)
  const doorLocked = !!focusedDoor && !doorOpen(focusedDoor.id)
  const doorOpenable = !!focusedDoor && canOpenDoor(focusedDoor, hasKey, roomKeys)
  const doorRoom = palace?.rooms.find((r) => r.id === focusedDoor?.fromRoomId)
  const doorMissing = doorRoom ? remainingToMemorize(doorRoom, memorized, exam) : 0
  const keyRoomName = (id: string | null) => palace?.rooms.find((r) => r.id === id)?.name ?? ''
  // La llave de la sala actual se muestra mientras le quede alguna compuerta por abrir.
  const currentRoomKey =
    !!roomKeys[room.id] && layout.doors.some((d) => d.fromRoomId === room.id && !doorOpen(d.id))

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
        {inDiorama ? <DioramaMinimap /> : <Minimap layout={layout} />}
        {hasKey && (
          <div className="key-badge">
            🗝️ Llave en inventario
          </div>
        )}
        {!hasKey && currentRoomKey && <div className="key-badge">🗝️ Llave de {room.title}</div>}
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
      {lastKeyRoomId && (
        <p className="hint hint-gold">🗝️ ¡Memorizaste toda la sala! Obtuviste la llave de {keyRoomName(lastKeyRoomId)}</p>
      )}
      {locked && doorLocked && !lastKeyRoomId && (
        <p className={`hint ${doorOpenable ? 'hint-gold' : 'hint-warn'}`}>
          {doorOpenable ? (
            <>
              <kbd>E</kbd> Usar llave para abrir compuerta
            </>
          ) : (
            <>
              🔒 Compuerta bloqueada: memoriza {doorMissing} {doorMissing === 1 ? 'pieza más' : 'piezas más'} de{' '}
              {doorRoom?.name} para obtener su llave
            </>
          )}
        </p>
      )}
      {locked && (!focusedDoorId || doorOpen(focusedDoorId)) && focusedId && !openId && (
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

      <Narrator layout={layout} />

      <p className="hud-legend">
        <kbd>W A S D</kbd> moverse · <kbd>Shift</kbd> correr · {arisAvailable && <><kbd>T</kbd> hablar con Aris · </>}<kbd>Mouse</kbd> mirar · <kbd>Esc</kbd> pausa
      </p>

      {locked && arisAvailable && (
        <button
          type="button"
          className="aris-trigger-btn"
          onClick={() => {
            useStore.getState().setArisPromptOpen(true)
            pointerLock.unlock()
          }}
          title="Consultar a Aris (T)"
        >
          <span>🤖 Aris</span>
          <kbd>T</kbd>
        </button>
      )}

      <ArisDialog />
      <ArisPrompt />

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
            <p className="pause-keys">
              <kbd>E</kbd> examinar · <kbd>M</kbd> memorizar · <kbd>N</kbd> narrador
              {mode === 'exam' && (
                <>
                  <br />
                  Responde en voz alta · <kbd>Y</kbd> para escribir
                </>
              )}
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
            <FreeExploreToggle checked={freeExplore} onChange={setFreeExplore} />


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

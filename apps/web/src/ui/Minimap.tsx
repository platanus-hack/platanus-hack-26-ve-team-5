import { useEffect, useRef, useState } from 'react'
import type { PalaceLayout } from '../palace/layout'
import { pieceKind } from '../palace/pieceKind'
import { DUE_THRESHOLD, strengthOf } from '../memory/model'
import { roomStrength } from '../memory/shown'
import { nowMs, useMemory } from '../memory/store'
import { playerPose, useStore } from '../store'
import { palaceKey } from '../memory/model'
import { DEFAULT_THEME, roomPalettes } from '../theme'

const PALE_PLASTER = '#D8D0C2'

function mixHex(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const c = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t)
  return `rgb(${c(0)} ${c(1)} ${c(2)})`
}

const COMPACT_SIZE = 180
const EXPANDED_SIZE = 340

export function Minimap({ layout }: { layout: PalaceLayout }) {
  const [expanded, setExpanded] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = expanded ? EXPANDED_SIZE : COMPACT_SIZE

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.current!.width = size * dpr
    canvas.current!.height = size * dpr
    ctx.scale(dpr, dpr)

    const { minX, maxX, minZ, maxZ } = layout.bounds
    const span = Math.max(maxX - minX, maxZ - minZ)
    const pad = expanded ? 22 : 14
    const k = (size - pad * 2) / span
    const ox = pad + (size - pad * 2 - (maxX - minX) * k) / 2
    const oz = pad + (size - pad * 2 - (maxZ - minZ) * k) / 2
    const tx = (x: number) => ox + (x - minX) * k
    const tz = (z: number) => oz + (z - minZ) * k

    const { tokens } = DEFAULT_THEME.ui
    const palettes = roomPalettes(DEFAULT_THEME, layout.rooms.map((r) => r.title))
    let raf = 0
    const palace = useStore.getState().palace
    const key = palace ? palaceKey(palace) : null

    const draw = () => {
      const { memorized, currentRoomId } = useStore.getState()
      const mem = (key && useMemory.getState().palaces[key]) || {}
      const now = nowMs()
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = tokens.surface
      ctx.fillRect(0, 0, size, size)
      ctx.lineJoin = 'miter'

      // Corredores
      for (const c of layout.corridors) {
        ctx.fillStyle = DEFAULT_THEME.scene.corridor.floor
        ctx.fillRect(tx(c.floor.x - c.floor.w / 2), tz(c.floor.z - c.floor.d / 2), c.floor.w * k, c.floor.d * k)
      }

      // Salas
      for (const r of layout.rooms) {
        const active = r.id === currentRoomId
        const x = tx(r.x - r.w / 2)
        const z = tz(r.z - r.d / 2)
        // El pigmento se apaga con la memoria de la sala (misma fuerza que ve la escena 3D).
        const fade = Math.min(1, Math.max(0, (1 - roomStrength(r.id)) / 0.7)) * 0.75
        ctx.fillStyle = mixHex(palettes[r.index].wall, PALE_PLASTER, fade)
        ctx.fillRect(x, z, r.w * k, r.d * k)
        // Marca de repaso: cuadrito dorado en la esquina si la sala tiene conceptos pendientes.
        if (r.pedestals.some((p) => mem[p.concept.id] && strengthOf(mem[p.concept.id], now) < DUE_THRESHOLD)) {
          const m = expanded ? 11 : 8
          ctx.fillStyle = tokens.accent
          ctx.strokeStyle = tokens.ink
          ctx.lineWidth = 1.2
          ctx.fillRect(x + 3, z + 3, m, m)
          ctx.strokeRect(x + 3, z + 3, m, m)
        }
        ctx.strokeStyle = tokens.ink
        ctx.lineWidth = active ? 3 : 1
        ctx.strokeRect(x, z, r.w * k, r.d * k)

        // Elementos / Pedestales
        for (const p of r.pedestals) {
          const done = !!memorized[p.concept.id]
          const kind = pieceKind(p.concept)
          const px = tx(p.x)
          const pz = tz(p.z)

          ctx.save()
          ctx.translate(px, pz)

          if (kind === 'key') {
            // Llave: rombo dorado
            ctx.fillStyle = '#ECC94B'
            ctx.strokeStyle = tokens.ink
            ctx.lineWidth = 1.2
            const rKey = expanded ? 6 : 4
            ctx.beginPath()
            ctx.moveTo(0, -rKey)
            ctx.lineTo(rKey, 0)
            ctx.lineTo(0, rKey)
            ctx.lineTo(-rKey, 0)
            ctx.closePath()
            ctx.fill()
            ctx.stroke()
          } else if (kind === 'chest') {
            // Cofre: caja dorada
            ctx.fillStyle = '#D69E2E'
            ctx.strokeStyle = tokens.ink
            ctx.lineWidth = 1.2
            const sChest = expanded ? 10 : 7
            ctx.fillRect(-sChest / 2, -sChest / 2, sChest, sChest)
            ctx.strokeRect(-sChest / 2, -sChest / 2, sChest, sChest)
          } else if (kind === 'trap') {
            // Trampa de púas: triángulo de peligro rojo
            ctx.fillStyle = '#E53E3E'
            ctx.strokeStyle = tokens.ink
            ctx.lineWidth = 1.2
            const rTrap = expanded ? 7 : 4.5
            ctx.beginPath()
            ctx.moveTo(0, -rTrap)
            ctx.lineTo(rTrap, rTrap)
            ctx.lineTo(-rTrap, rTrap)
            ctx.closePath()
            ctx.fill()
            ctx.stroke()
          } else if (kind === 'door') {
            // Compuerta: portal circular cian
            ctx.fillStyle = '#319795'
            ctx.strokeStyle = tokens.ink
            ctx.lineWidth = 1.2
            const rDoor = expanded ? 6 : 4
            ctx.beginPath()
            ctx.arc(0, 0, rDoor, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          } else {
            // Estándar
            ctx.fillStyle = done ? tokens.accent : tokens.surface
            ctx.strokeStyle = tokens.ink
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(0, 0, done ? (expanded ? 4.5 : 3.2) : (expanded ? 3.5 : 2.4), 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }

          ctx.restore()
        }
      }

      // Jugador: flecha de tinta con borde de yeso, apuntando a donde mira
      const px = tx(playerPose.x)
      const pz = tz(playerPose.z)
      const a = playerPose.yaw
      ctx.fillStyle = tokens.ink
      ctx.strokeStyle = tokens.surface
      ctx.lineWidth = 2
      ctx.beginPath()
      const arrowLen = expanded ? 12 : 8
      const wingLen = expanded ? 9 : 6
      ctx.moveTo(px + Math.sin(a) * arrowLen, pz + Math.cos(a) * arrowLen)
      ctx.lineTo(px + Math.sin(a + 2.5) * wingLen, pz + Math.cos(a + 2.5) * wingLen)
      ctx.lineTo(px + Math.sin(a - 2.5) * wingLen, pz + Math.cos(a - 2.5) * wingLen)
      ctx.closePath()
      ctx.stroke()
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [layout, size, expanded])

  return (
    <div className="minimap-wrapper">
      <div className="minimap-header">
        <button
          type="button"
          className="minimap-toggle"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Contraer minimapa' : 'Desplegar minimapa'}
        >
          {expanded ? '⤡ Contraer' : '⤢ Desplegar'}
        </button>
      </div>
      <canvas
        ref={canvas}
        className="minimap"
        style={{ width: size, height: size }}
        onClick={() => setExpanded(!expanded)}
        title={expanded ? 'Haz clic para contraer' : 'Haz clic para desplegar minimapa'}
        aria-label="Minimapa"
      />
      {expanded && (
        <div className="minimap-legend">
          <span><i className="legend-chip" style={{ background: '#ECC94B' }} /> Llave</span>
          <span><i className="legend-chip" style={{ background: '#D69E2E' }} /> Cofre</span>
          <span><i className="legend-chip" style={{ background: '#E53E3E' }} /> Trampa</span>
          <span><i className="legend-chip" style={{ background: '#319795' }} /> Puerta</span>
        </div>
      )}
    </div>
  )
}

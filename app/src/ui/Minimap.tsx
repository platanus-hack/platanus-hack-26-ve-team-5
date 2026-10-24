import { useEffect, useRef } from 'react'
import type { PalaceLayout } from '../palace/layout'
import { playerPose, useStore } from '../store'

const SIZE = 180

export function Minimap({ layout }: { layout: PalaceLayout }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.current!.width = SIZE * dpr
    canvas.current!.height = SIZE * dpr
    ctx.scale(dpr, dpr)

    const { minX, maxX, minZ, maxZ } = layout.bounds
    const span = Math.max(maxX - minX, maxZ - minZ)
    const pad = 14
    const k = (SIZE - pad * 2) / span
    const ox = pad + (SIZE - pad * 2 - (maxX - minX) * k) / 2
    const oz = pad + (SIZE - pad * 2 - (maxZ - minZ) * k) / 2
    const tx = (x: number) => ox + (x - minX) * k
    const tz = (z: number) => oz + (z - minZ) * k

    let raf = 0
    const draw = () => {
      const { memorized, currentRoomId } = useStore.getState()
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.lineWidth = 1
      for (const c of layout.corridors) {
        ctx.fillStyle = 'rgba(139,124,255,0.25)'
        ctx.fillRect(tx(c.floor.x - c.floor.w / 2), tz(c.floor.z - c.floor.d / 2), c.floor.w * k, c.floor.d * k)
      }
      for (const r of layout.rooms) {
        const active = r.id === currentRoomId
        ctx.fillStyle = active ? r.color + '33' : 'rgba(27,22,56,0.85)'
        ctx.strokeStyle = r.color
        ctx.globalAlpha = active ? 1 : 0.6
        ctx.fillRect(tx(r.x - r.w / 2), tz(r.z - r.d / 2), r.w * k, r.d * k)
        ctx.strokeRect(tx(r.x - r.w / 2), tz(r.z - r.d / 2), r.w * k, r.d * k)
        for (const p of r.pedestals) {
          ctx.fillStyle = memorized[p.concept.id] ? '#FFD36B' : r.color
          ctx.fillRect(tx(p.x) - 1.5, tz(p.z) - 1.5, 3, 3)
        }
        ctx.globalAlpha = 1
      }
      // Jugador: triángulo apuntando a donde mira.
      const px = tx(playerPose.x)
      const pz = tz(playerPose.z)
      const a = playerPose.yaw
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.moveTo(px + Math.sin(a) * 7, pz + Math.cos(a) * 7)
      ctx.lineTo(px + Math.sin(a + 2.5) * 5, pz + Math.cos(a + 2.5) * 5)
      ctx.lineTo(px + Math.sin(a - 2.5) * 5, pz + Math.cos(a - 2.5) * 5)
      ctx.closePath()
      ctx.fill()
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [layout])

  return <canvas ref={canvas} className="minimap" style={{ width: SIZE, height: SIZE }} aria-label="Minimapa" />
}

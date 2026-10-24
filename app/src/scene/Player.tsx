import { PointerLockControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import { Vector3 } from 'three'

import { moveWithCollisions, roomAt, type PalaceLayout } from '../palace/layout'
import { playerPose, useStore } from '../store'

const EYE = 1.7
const WALK = 4.5
const RUN = 8
const REACH = 3.2

const onLock = () => useStore.getState().set({ locked: true })
const onUnlock = () => useStore.getState().set({ locked: false })

// Permite que el HUD bloquee/desbloquee el puntero sin acceder a la escena.
export const pointerLock = { lock: () => {}, unlock: () => {} }

export function Player({ layout }: { layout: PalaceLayout }) {
  const camera = useThree((s) => s.camera)
  const controls = useRef<ComponentRef<typeof PointerLockControls>>(null)
  const keys = useRef<Record<string, boolean>>({})
  const forward = useRef(new Vector3())

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    camera.position.set(layout.spawn.x, EYE, layout.spawn.z)
    camera.rotation.set(0, layout.spawn.yaw, 0)
    pointerLock.lock = () => controls.current?.lock()
    pointerLock.unlock = () => controls.current?.unlock()
  }, [camera, layout])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      keys.current[e.code] = true
      const s = useStore.getState()
      if (e.code === 'KeyE') {
        if (s.openId) s.set({ openId: null })
        else if (s.focusedId) {
          s.set({ openId: s.focusedId })
          // En el examen hay que escribir, así que se libera el puntero.
          if (s.mode === 'exam' && !s.exam[s.focusedId]) controls.current?.unlock()
        }
      }
      if (e.code === 'KeyM' && s.mode === 'explore') {
        const id = s.openId ?? s.focusedId
        if (id) s.toggleMemorized(id)
      }
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    const clear = () => {
      keys.current = {}
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useStore.getState()
    const k = keys.current
    const f = forward.current
    camera.getWorldDirection(f)
    f.y = 0
    f.normalize()

    if (s.locked) {
      const ax = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)
      const az = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      if (ax || az) {
        const speed = (k.ShiftLeft || k.ShiftRight ? RUN : WALK) * dt
        // derecha = forward × up = (-f.z, 0, f.x)
        let dx = f.x * az - f.z * ax
        let dz = f.z * az + f.x * ax
        const len = Math.hypot(dx, dz)
        dx = (dx / len) * speed
        dz = (dz / len) * speed
        const next = moveWithCollisions(layout.colliders, camera.position.x, camera.position.z, dx, dz)
        camera.position.x = next.x
        camera.position.z = next.z
      }
    }

    playerPose.x = camera.position.x
    playerPose.z = camera.position.z
    playerPose.yaw = Math.atan2(f.x, f.z)

    const room = roomAt(layout, camera.position.x, camera.position.z)
    if (room && room.id !== s.currentRoomId) s.set({ currentRoomId: room.id })

    // Pedestal al que se está mirando y que está al alcance.
    let best: string | null = null
    let bestDist = REACH
    for (const p of room?.pedestals ?? []) {
      const vx = p.x - camera.position.x
      const vz = p.z - camera.position.z
      const dist = Math.hypot(vx, vz)
      if (dist > bestDist || dist < 0.01) continue
      if ((vx * f.x + vz * f.z) / dist < 0.8) continue
      best = p.concept.id
      bestDist = dist
    }
    if (best !== s.focusedId) {
      // Al alejarse, la tarjeta de exploración se cierra sola.
      const closeCard = s.openId && s.mode === 'explore' && s.openId !== best
      s.set(closeCard ? { focusedId: best, openId: null } : { focusedId: best })
    }
  })

  // El selector no coincide con nada a propósito: sin él, drei bloquea el puntero con
  // cualquier clic del documento (incluidos los botones del HUD). Bloqueamos a mano.
  return <PointerLockControls ref={controls} selector="#manual-lock-only" onLock={onLock} onUnlock={onUnlock} />
}

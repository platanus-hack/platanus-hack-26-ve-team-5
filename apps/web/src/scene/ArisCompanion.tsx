import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useDioramaStore } from '../diorama/dioramaStore'
import { useStore } from '../store'
import { ARIS_OFFSET, arisVisible } from './arisAnchor'

const MODEL_PATH = '/models/aris-v2/model.glb'

// Objetos reutilizables en memoria para evitar allocations en el render loop (0 GC)
const _targetPos = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _velocity = new THREE.Vector3()
const _lookTarget = new THREE.Vector3()
const _dummy = new THREE.Object3D()

function ArisModelInner() {
  const { scene } = useGLTF(MODEL_PATH)
  const clonedScene = useMemo(() => scene.clone(), [scene])

  const groupRef = useRef<THREE.Group>(null)
  const currentPos = useRef(new THREE.Vector3())
  const lastPos = useRef(new THREE.Vector3())
  const initialized = useRef(false)

  // Control de lado (hombro derecho/izquierdo)
  const sideSign = useRef(1)
  const sideTimer = useRef(0)

  // Control de transiciones de sala (holograma que desaparece y reaparece)
  const lastRoomId = useRef<string | null>(null)
  const hologramScale = useRef(1)
  const isTransitioning = useRef(false)

  // Curioseo ("da vueltitas viendo todo")
  const curiousYaw = useRef(0)

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    // Dentro de un cuadro (y al entrar/salir) Aris se oculta; al volver reaparece junto al jugador.
    const visible = arisVisible(useDioramaStore.getState().phase)
    group.visible = visible
    if (!visible) {
      initialized.current = false
      return
    }

    const dt = Math.min(delta, 0.1)
    const t = state.clock.getElapsedTime()
    const camera = state.camera
    const currentRoom = useStore.getState().currentRoomId

    // 1. Inicialización en el primer frame en el campo de visión del jugador
    if (!initialized.current) {
      camera.getWorldDirection(_forward)
      _forward.y = 0
      _forward.normalize()
      _right.set(-_forward.z, 0, _forward.x)

      currentPos.current
        .copy(camera.position)
        .addScaledVector(_forward, ARIS_OFFSET.forward)
        .addScaledVector(_right, sideSign.current * ARIS_OFFSET.side)
      currentPos.current.y = camera.position.y - ARIS_OFFSET.down

      lastPos.current.copy(currentPos.current)
      group.position.copy(currentPos.current)
      lastRoomId.current = currentRoom
      initialized.current = true
      return
    }

    // 2. Detección de cambio de sala: solo si ya estaba en una sala válida previa
    if (lastRoomId.current === null) {
      lastRoomId.current = currentRoom
    } else if (currentRoom && currentRoom !== lastRoomId.current) {
      lastRoomId.current = currentRoom
      isTransitioning.current = true
    }

    if (isTransitioning.current) {
      // Reducción rápida de escala (desaparición holográfica)
      hologramScale.current = Math.max(0, hologramScale.current - dt * 6)
      if (hologramScale.current <= 0.01) {
        // Teletransportación instantánea al campo de visión del jugador en la nueva sala
        camera.getWorldDirection(_forward)
        _forward.y = 0
        _forward.normalize()
        _right.set(-_forward.z, 0, _forward.x)

        currentPos.current
          .copy(camera.position)
          .addScaledVector(_forward, ARIS_OFFSET.forward)
          .addScaledVector(_right, sideSign.current * ARIS_OFFSET.side)
        currentPos.current.y = camera.position.y - ARIS_OFFSET.down

        lastPos.current.copy(currentPos.current)
        group.position.copy(currentPos.current)
        isTransitioning.current = false
      }
    } else {
      // Reaparición elástica suave
      hologramScale.current = Math.min(1, hologramScale.current + dt * 4.5)
    }

    // 3. Alternancia periódica de lado (cambia suavemente entre derecha e izquierda)
    sideTimer.current += dt
    if (sideTimer.current > 14) {
      sideSign.current *= -1
      sideTimer.current = 0
    }

    // 4. Cálculo del punto de anclaje DENTRO de la pantalla (FOV 70°)
    camera.getWorldDirection(_forward)
    _forward.y = 0
    _forward.normalize()
    _right.set(-_forward.z, 0, _forward.x)

    _targetPos
      .copy(camera.position)
      .addScaledVector(_forward, ARIS_OFFSET.forward) // Adelante en el campo visual
      .addScaledVector(_right, sideSign.current * ARIS_OFFSET.side) // Al lateral visible de la pantalla
    _targetPos.y = camera.position.y - ARIS_OFFSET.down

    // 5. Seguimiento con Lerp elástico (framerate-independent exponential decay)
    const followFactor = 1 - Math.exp(-6.0 * dt)
    currentPos.current.lerp(_targetPos, followFactor)

    // 6. Micro-animaciones: Flotación (Bobbing), Respiración y animación de habla
    const isSpeaking = !!useStore.getState().arisMessage
    const bobbing = Math.sin(t * 2.4) * 0.07
    const breathing = Math.sin(t * 3.2) * 0.025
    const talkBob = isSpeaking ? Math.sin(t * 9) * 0.035 : 0

    group.position.x = currentPos.current.x
    group.position.y = currentPos.current.y + bobbing + talkBob
    group.position.z = currentPos.current.z

    // 7. Estimación de velocidad para alternar entre modo vuelo y curioseo en reposo
    _velocity.copy(currentPos.current).sub(lastPos.current).divideScalar(dt)
    lastPos.current.copy(currentPos.current)
    const speed = _velocity.length()

    // 8. Mirada y orientación: La mayoría de las veces enfocado en el usuario
    // Si está hablando, mantiene 100% de atención fija en el usuario
    const cycleTime = t % 8.0
    const looksAtUser = isSpeaking || cycleTime < 6.0

    if (speed > 0.8) {
      // En desplazamiento rápido: se orienta hacia el vector de avance
      _lookTarget.copy(currentPos.current).add(_velocity)
      _lookTarget.y = group.position.y
      _dummy.position.copy(group.position)
      _dummy.lookAt(_lookTarget)
      group.quaternion.slerp(_dummy.quaternion, 1 - Math.exp(-6 * dt))
    } else if (looksAtUser) {
      // Mayoría del tiempo: contacto visual directo con el usuario (cámara)
      _lookTarget.copy(camera.position)
      _dummy.position.copy(group.position)
      _dummy.lookAt(_lookTarget)
      group.quaternion.slerp(_dummy.quaternion, 1 - Math.exp(-4.5 * dt))
    } else {
      // Curioseo ocasional (25% del tiempo): mira hacia adelante hacia donde explora el jugador
      _lookTarget.copy(camera.position).addScaledVector(_forward, 4)
      _lookTarget.y += Math.sin(t * 1.8) * 0.25
      _dummy.position.copy(group.position)
      _dummy.lookAt(_lookTarget)
      group.quaternion.slerp(_dummy.quaternion, 1 - Math.exp(-2.5 * dt))
    }

    // 9. Aplicación de escala con breathing y factor holográfico de sala
    const baseScale = 0.5 * hologramScale.current
    const sx = baseScale * (1 - breathing)
    const sy = baseScale * (1 + breathing)
    const sz = baseScale * (1 - breathing)
    group.scale.set(sx, sy, sz)
  })

  return (
    <group ref={groupRef}>
      {/* Rotación 180° en Y para alinear los ojos (+Z en glTF) con el eje de visión (-Z en Three.js lookAt) */}
      <primitive object={clonedScene} rotation={[0, Math.PI, 0]} castShadow receiveShadow />
    </group>
  )
}

export function ArisCompanion() {
  return (
    <Suspense fallback={null}>
      <ArisModelInner />
    </Suspense>
  )
}

useGLTF.preload(MODEL_PATH)

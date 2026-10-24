import { Billboard, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Fragment, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Atmosphere } from './atmosphere'
import type { Diorama } from '@mus3o/shared'
import { LabelPlate } from '../scene/LabelPlate'
import { DEFAULT_THEME } from '../theme'
import { Builder, darken, lighten, mat } from './geo'
import { makeDioramaMaterials, type TimeUniform } from './material'
import { fireLights } from './fires'
import { getDioramaModel, type DioramaModel, type PropGroup } from './model'
import { buildGrassTuft } from './props/nature'
import { ScienceAmbient, ScienceOverlay, useScienceMaterials } from './props/science/ScienceOverlay' // science-kit
import { mulberry32, range } from './random'
import { TERRAIN_EXTENT } from './terrain'

const FONT_BODY = '/fonts/HankenGrotesk.ttf'

// --- Cielo: bandas de tono, sin degradado suave ni resplandor ---
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize( position );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uWarm;
  uniform float uWarmAmt;
  varying vec3 vDir;
  void main() {
    float h = clamp( vDir.y, 0.0, 1.0 );
    float t = floor( pow( h, 0.55 ) * 8.0 + 0.5 ) / 8.0;
    vec3 col = mix( uHorizon, uTop, t );
    float s = max( dot( normalize( vDir ), normalize( uSunDir ) ), 0.0 );
    float band = floor( pow( s, 4.0 ) * 5.0 ) / 5.0;
    col = mix( col, uWarm, band * uWarmAmt );
    gl_FragColor = vec4( col, 1.0 );
    #include <colorspace_fragment>
  }
`

function SkyDome({ atmo, follow }: { atmo: Atmosphere; follow: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(atmo.skyTop) },
      uHorizon: { value: new THREE.Color(atmo.skyHorizon) },
      uSunDir: { value: new THREE.Vector3(...atmo.sunDir) },
      uWarm: { value: new THREE.Color(atmo.sunColor) },
      uWarmAmt: { value: atmo.sunDir[1] < 0.4 && atmo.sunIntensity > 1.5 ? 0.3 : 0 },
    }),
    [atmo],
  )
  useFrame(() => {
    const m = ref.current
    if (follow && m && m.parent) {
      _p.copy(camera.position)
      m.position.copy(m.parent.worldToLocal(_p))
    }
  })
  return (
    <mesh ref={ref} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[250, 24, 14]} />
      <shaderMaterial vertexShader={SKY_VERT} fragmentShader={SKY_FRAG} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  )
}

function Stars() {
  const geo = useMemo(() => {
    const r = mulberry32(99)
    const pos: number[] = []
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2
      const e = Math.asin(0.08 + r() * 0.92)
      pos.push(Math.cos(a) * Math.cos(e) * 235, Math.sin(e) * 235, Math.sin(a) * Math.cos(e) * 235)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [])
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial color="#e8ecff" size={1.8} sizeAttenuation={false} fog={false} depthWrite={false} />
    </points>
  )
}

function Clouds({ atmo, clipping }: { atmo: Atmosphere; clipping: THREE.Plane[] | null }) {
  const ref = useRef<THREE.Group>(null)
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const geo = useMemo(() => {
    const r = mulberry32(31)
    const b = new Builder()
    for (let i = 0; i < 11; i++) {
      const a = r() * Math.PI * 2
      const d = range(r, 110, 200)
      const y = range(r, 62, 105)
      const n = 3 + Math.floor(r() * 3)
      for (let k = 0; k < n; k++) {
        b.ico(range(r, 6, 11), mat(Math.cos(a) * d + (k - n / 2) * 10, y + range(r, -1, 1.5), Math.sin(a) * d + range(r, -4, 4), 0, r() * 3, 0, 1.9, 0.38, 1.1), {
          color: k === 0 ? darken(atmo.cloudColor, 0.04) : atmo.cloudColor,
          jitter: 0.03,
        }, 1)
      }
    }
    return b.build()
  }, [atmo.cloudColor])
  useFrame((_, dt) => {
    if (ref.current && !reduced) ref.current.rotation.y += dt * 0.0035
  })
  return (
    <group ref={ref}>
      <mesh geometry={geo} frustumCulled={false}>
        <meshStandardMaterial vertexColors flatShading roughness={1} fog={false} clippingPlanes={clipping} emissive={atmo.cloudColor} emissiveIntensity={0.42} />
      </mesh>
    </group>
  )
}

// --- Hierba: mechones instanciados que se balancean con el viento ---
function Grass({ model, material }: { model: DioramaModel; material: THREE.Material }) {
  const { diorama, field, layout } = model
  const density = ({ plain: 2600, hills: 2600, forest: 3000, river: 2200, coast: 1500, mountains: 900, desert: 500, city: 0, interior: 0, abstract: 0 } as Record<string, number>)[diorama.terrain] ?? 0 // science-kit: ?? 0
  const geo = useMemo(() => buildGrassTuft(lighten(diorama.palette.ground, 0.06)), [diorama.palette.ground])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const count = density
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m || !count) return
    const r = mulberry32(model.seed + 5)
    const mm = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const sc = new THREE.Vector3()
    let n = 0
    for (let i = 0; i < count * 2 && n < count; i++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * 46
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d * 0.9 - 2
      const y = field.heightAt(x, z)
      if (field.isWater(x, z) || (field.waterLevel !== null && y < field.waterLevel + 0.15)) continue
      if (layout.colliders.some((c) => c.r > 0.3 && Math.hypot(c.x - x, c.z - z) < c.r + 0.2)) continue
      e.set(0, r() * 6.28, 0)
      q.setFromEuler(e)
      const s = range(r, 0.7, 1.5)
      sc.set(s, s * range(r, 0.8, 1.3), s)
      mm.compose(new THREE.Vector3(x, y - 0.02, z), q, sc)
      m.setMatrixAt(n++, mm)
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
  }, [count, field, layout, model.seed])
  if (!count) return null
  return <instancedMesh ref={mesh} args={[geo, material, count]} receiveShadow frustumCulled={false} />
}

// --- Props instanciados ---
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

function PropMesh({ group, material, depth, time }: { group: PropGroup; material: THREE.Material; depth: THREE.Material; time: TimeUniform }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const motion = group.built.motion
  const place = (t: number) => {
    const mesh = ref.current
    if (!mesh) return
    group.instances.forEach((i, k) => {
      let y = i.y
      let pitch = 0
      let roll = 0
      let ox = 0
      let oz = 0
      let yaw = 0
      if (motion === 'drift') {
        // science-kit: moléculas y orgánulos que flotan a la deriva
        y += Math.sin(t * 0.55 + i.phase) * 0.45
        ox = Math.cos(t * 0.23 + i.phase * 1.7) * 0.55
        oz = Math.sin(t * 0.19 + i.phase) * 0.55
        roll = Math.sin(t * 0.4 + i.phase) * 0.12
        pitch = Math.cos(t * 0.33 + i.phase * 2) * 0.08
        yaw = t * 0.12 + i.phase
      } else if (motion === 'gallop') {
        const w = t * 6.2 + i.phase
        y += Math.abs(Math.sin(w)) * 0.13 * i.scale
        pitch = Math.sin(w + 0.7) * 0.045
        const drift = Math.sin(t * 0.5 + i.phase) * 0.7
        ox = Math.sin(i.rotY) * drift
        oz = Math.cos(i.rotY) * drift
      } else if (motion === 'breath') {
        y += Math.sin(t * 1.4 + i.phase) * 0.012
        roll = Math.sin(t * 0.9 + i.phase) * 0.014
      } else if (motion === 'idle') {
        y += Math.sin(t * 0.8 + i.phase) * 0.08
        roll = Math.sin(t * 0.6 + i.phase) * 0.025
        pitch = Math.sin(t * 0.5 + i.phase * 2) * 0.012
      }
      _e.set(pitch, i.rotY + yaw, roll, 'YXZ')
      _q.setFromEuler(_e)
      _p.set(i.x + ox, y, i.z + oz)
      _s.setScalar(i.scale)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(k, _m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => {
    place(0)
  }, [group]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    if (motion !== 'none') place(time.value)
  })
  return (
    <instancedMesh
      ref={ref}
      args={[group.built.geometry, material, group.instances.length]}
      customDepthMaterial={depth as THREE.MeshDepthMaterial}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

const LABEL_SURFACE = DEFAULT_THEME.ui.tokens.surface
const LABEL_INK = DEFAULT_THEME.ui.tokens.ink

// --- Enlaces con conceptos: anillo en el suelo y etiqueta flotante ---
function LinkedMark({ link, focused }: { link: DioramaModel['layout']['linked'][number]; focused: boolean }) {
  const group = useRef<THREE.Group>(null)
  const tag = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const g = group.current
    if (!g) return
    // Distancia a la propia etiqueta (no al origen del grupo), en metros reales del diorama.
    const wp = g.localToWorld(_p.set(link.x, link.labelY, link.z))
    g.getWorldScale(_s)
    const dist = wp.distanceTo(camera.position) / (_s.x || 1)
    const o = Math.min(1, Math.max(0, (34 - dist) / 8))
    g.visible = o > 0.02
    // La placa mantiene un tamaño casi constante en pantalla (crece con la distancia, se encoge de cerca)
    // y aparece creciendo desde cero al acercarse (sin tocar su opacidad: así siempre se lee).
    tag.current?.scale.setScalar(Math.min(2.4, Math.max(0.55, dist / 13)) * Math.min(1, o * 2))
  })
  return (
    <group ref={group}>
      <mesh position={[link.x, link.y + 0.05, link.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[focused ? 0.95 : 0.8, focused ? 1.18 : 0.96, 32]} />
        <meshBasicMaterial color="#f2f1ee" side={THREE.DoubleSide} fog={false} toneMapped={false} />
      </mesh>
      {link.label && (
        <Suspense fallback={null}>
          <Billboard ref={tag} position={[link.x, link.labelY, link.z]}>
            {/* Misma placa de yeso que las del palacio: se lee sobre cualquier fondo. */}
            <group position={[0, focused ? 0.62 : 0.55, 0]}>
              <LabelPlate
                font={FONT_BODY}
                fontSize={focused ? 0.42 : 0.34}
                maxWidth={5.5}
                surface={LABEL_SURFACE}
                ink={LABEL_INK}
                onTop
              >
                {link.label}
              </LabelPlate>
            </group>
          </Billboard>
        </Suspense>
      )}
    </group>
  )
}

export type DioramaSceneProps = {
  diorama: Diorama
  /** Escala del conjunto: 1 = tamaño real; <1 = maqueta (ventana del cuadro). */
  unit?: number
  shadowMapSize?: number
  /** Muestra anillos y etiquetas de los props vinculados a conceptos. */
  labels?: boolean
  focusedPieceId?: string | null
  /** El cielo acompaña a la cámara (mundo a escala real). */
  followSky?: boolean
  /** Plano de corte (ventana): solo se dibuja lo que queda detrás. */
  clip?: THREE.Plane
}

export function DioramaScene({ diorama, unit = 1, shadowMapSize = 2048, labels = false, focusedPieceId = null, followSky = false, clip }: DioramaSceneProps) {
  const model = useMemo(() => getDioramaModel(diorama), [diorama])
  const { atmo } = model
  const time = useMemo<TimeUniform>(() => ({ value: 0 }), [])
  const { material, depth } = useMemo(() => makeDioramaMaterials(time), [time])
  const light = useRef<THREE.DirectionalLight>(null)
  const clipping = useMemo(() => (clip ? [clip] : null), [clip])
  useLayoutEffect(() => {
    material.clippingPlanes = clipping
    material.needsUpdate = true
  }, [material, clipping])
  const sci = useScienceMaterials(time, clipping) // science-kit

  // prefers-reduced-motion: la maqueta queda quieta (sin viento ni oleaje de telas).
  const still = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  useFrame((_, dt) => {
    if (!still) time.value += Math.min(dt, 0.1)
  })
  // El objetivo de la luz debe vivir en el grafo para que su matriz se actualice.
  useLayoutEffect(() => {
    const l = light.current
    const parent = l?.parent
    if (!l || !parent) return
    parent.add(l.target)
    return () => {
      parent.remove(l.target)
    }
  }, [])
  useEffect(
    () => () => {
      material.dispose()
      depth.dispose()
    },
    [material, depth],
  )

  const half = 24 * unit
  const sunPos = useMemo(() => {
    const v = new THREE.Vector3(...atmo.sunDir).normalize().multiplyScalar(70 * unit)
    return v.toArray() as [number, number, number]
  }, [atmo, unit])
  const fires = useMemo(() => fireLights(model.groups), [model])

  return (
    <group>
      <hemisphereLight args={[atmo.hemiSky, atmo.hemiGround, atmo.hemiIntensity]} />
      <directionalLight
        ref={light}
        color={atmo.sunColor}
        intensity={atmo.sunIntensity}
        position={sunPos}
        castShadow
        shadow-mapSize={[Math.min(shadowMapSize, 2048), Math.min(shadowMapSize, 2048)]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.05 * unit}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1 * unit}
        shadow-camera-far={150 * unit}
      />
      <group scale={unit}>
        <SkyDome atmo={atmo} follow={followSky} />
        {atmo.stars && <Stars />}
        {atmo.clouds && <Clouds atmo={atmo} clipping={clipping} />}
        <mesh geometry={model.terrain} receiveShadow>
          <meshStandardMaterial vertexColors flatShading roughness={1} clippingPlanes={clipping} />
        </mesh>
        {model.field.waterLevel !== null && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, model.field.waterLevel, 0]} receiveShadow>
            <planeGeometry args={[TERRAIN_EXTENT * 2, TERRAIN_EXTENT * 2, 1, 1]} />
            <meshStandardMaterial color={atmo.water} roughness={0.55} transparent opacity={0.9} flatShading clippingPlanes={clipping} />
          </mesh>
        )}
        <Grass model={model} material={material} />
        <ScienceAmbient model={model} time={time} clipping={clipping} />
        {model.groups.map((g) => (
          <Fragment key={`${g.index}-${g.variant}`}>
            {!g.built.science?.dynamicOnly && <PropMesh group={g} material={g.built.science?.shader ? sci.material : material} depth={g.built.science?.shader ? sci.depth : depth} time={time} />}
            {g.built.science && <ScienceOverlay group={g} material={material} depth={depth} time={time} clipping={clipping} />}
          </Fragment>
        ))}
        {labels && model.layout.linked.map((l) => <LinkedMark key={l.pieceId} link={l} focused={focusedPieceId === l.pieceId} />)}
        {fires.map((f) => (
          <pointLight
            key={f.key}
            position={f.position}
            color={f.color}
            intensity={f.intensity * unit * unit * (atmo.stars ? 1.6 : 0.8)}
            distance={f.distance * unit}
            decay={2}
          />
        ))}
      </group>
    </group>
  )
}

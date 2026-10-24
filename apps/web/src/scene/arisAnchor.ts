/**
 * Dónde flota Aris respecto a la cámara (m): hacia delante, hacia el lado (± según el hombro) y hacia abajo.
 * Sale del centro de la vista para no tapar cuadros, pedestales ni mira.
 */
export const ARIS_OFFSET = { forward: 1.6, side: 0.95, down: 0.5 }

/** Ángulo (grados) entre el eje de la cámara y Aris. */
export function arisAngleFromCenter(o = ARIS_OFFSET): number {
  return (Math.atan2(Math.hypot(o.side, o.down), o.forward) * 180) / Math.PI
}

/** Aris solo se ve en el palacio: ni dentro de un cuadro ni durante las transiciones (fase distinta de 'room'). */
export function arisVisible(dioramaPhase: string): boolean {
  return dioramaPhase === 'room'
}

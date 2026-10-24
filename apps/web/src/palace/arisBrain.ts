import type { Museum } from '@mus3o/shared'
import { playArisVoice } from './arisAudio'

export type ArisResponse = {
  text: string
  targetCoords?: [number, number] // [x, z] en el mundo si aplica para guiar la mirada
}

type BrainContext = {
  palace: Museum | null
  currentRoomId: string | null
  memorized: Record<string, true>
  hasKey: boolean
  unlockedDoors: Record<string, true>
  roomKeys?: Record<string, true>
  mode: 'explore' | 'exam'
}

// Distancia de Levenshtein simple para tolerancia a errores tipográficos (0 KB)
function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99
  const d: number[][] = []
  for (let i = 0; i <= a.length; i++) d[i] = [i]
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    }
  }
  return d[a.length][b.length]
}

function matchesAny(tokens: string[], targets: string[], maxDist = 1): boolean {
  return tokens.some((token) =>
    targets.some((target) => {
      if (token === target) return true
      if (token.includes(target) || target.includes(token)) return true
      return token.length >= 3 && target.length >= 3 && levenshtein(token, target) <= maxDist
    })
  )
}

export function evaluateArisQuery(query: string, ctx: BrainContext): ArisResponse {
  const q = query.toLowerCase().trim()
  const rawTokens = q.split(/[\s,?.!¿¡;:]+/).filter(Boolean)
  const { palace, currentRoomId, memorized, hasKey, unlockedDoors, mode } = ctx

  if (!palace || palace.rooms.length === 0) {
    return { text: 'Aris: Aún estamos levantando los cimientos del palacio. ¡Enseguida estará listo!' }
  }

  const currentRoom = palace.rooms.find((r) => r.id === currentRoomId) ?? palace.rooms[0]
  const currentIndex = palace.rooms.findIndex((r) => r.id === currentRoom.id)
  const currentPieces = currentRoom.pieces || []
  const unmemorizedInRoom = currentPieces.filter((p) => !memorized[p.id])
  const allPieces = palace.rooms.flatMap((r) => r.pieces)
  const totalCount = allPieces.length
  const memorizedTotal = allPieces.filter((p) => memorized[p.id]).length

  // 1. SALUDOS / PRESENTACIÓN ("hoa", "hola", "buenas", "hey", "aris", "quién eres")
  if (matchesAny(rawTokens, ['hola', 'hoa', 'ola', 'buenas', 'buenos', 'hey', 'saludos', 'quien', 'aris'])) {
    return {
      text: 'Aris: ¡Hola! Soy Aris, tu compañero de estudio en este palacio. Puedo orientarte hacia la siguiente sala, recordarte qué conceptos te faltan memorizar o darte pistas. ¿Qué quieres explorar?',
    }
  }

  // 2. AGRADECIMIENTOS / SOCIAL ("gracias", "genial", "crack", "bien")
  if (matchesAny(rawTokens, ['gracias', 'genial', 'crack', 'excelente', 'bueno', 'perfecto', 'vale'])) {
    return {
      text: 'Aris: ¡A ti! Me alegra acompañarte. Recuerda que puedes preguntarme en cualquier momento si tienes dudas durante tu recorrido.',
    }
  }

  // 3. PROGRESO / SCORE ("cómo voy", "progreso", "cuánto llevo", "score", "avance")
  if (matchesAny(rawTokens, ['progreso', 'score', 'cuanto', 'cuánto', 'avance', 'puntos', 'porcentaje', 'estadistica'])) {
    const pct = Math.round((memorizedTotal / Math.max(totalCount, 1)) * 100)
    return {
      text: `Aris: Tu avance en el palacio es del ${pct}% (${memorizedTotal} de ${totalCount} conceptos dominados). En la sala actual "${currentRoom.name}" te faltan ${unmemorizedInRoom.length} pedestales por aprender.`,
    }
  }

  // 4. UBICACIÓN / DÓNDE ESTOY ("dónde estoy", "qué sala es", "lugar")
  if (
    matchesAny(rawTokens, ['donde', 'dónde', 'ubicacion', 'ubicación', 'lugar']) &&
    (q.includes('estoy') || q.includes('estamos') || q.includes('sala') || q.includes('aqui') || q.includes('aquí'))
  ) {
    return {
      text: `Aris: Estás en la Sala ${currentIndex + 1} de ${palace.rooms.length}: "${currentRoom.name}". Cuenta con ${currentPieces.length} pedestales conceptuales distribuidos en el anillo de la sala.`,
    }
  }

  // 5. NAVEGACIÓN / LLAVE / COMPUERTA / PUERTA ("llave", "puerta", "reja", "bloquead")
  const { roomKeys } = ctx
  if (matchesAny(rawTokens, ['llave', 'puerta', 'compuerta', 'reja', 'candado', 'bloquead', 'abrir', 'cerrad'])) {
    const hasRoomKey = !!roomKeys?.[currentRoom.id]
    if (hasKey || hasRoomKey) {
      return {
        text: `Aris: ¡Tienes acceso para abrir la compuerta! ${hasRoomKey ? 'Ganaste la llave de esta sala al memorizar sus piezas.' : 'Tienes la Llave de Hierro en tu inventario.'} Acércate a la puerta y presiona E para desbloquearla.`,
      }
    } else {
      return {
        text: 'Aris: Para abrir la compuerta tienes dos caminos: memorizar todas las piezas de esta sala para ganar su llave de acceso, o encontrar la Llave de Hierro en el suelo.',
      }
    }
  }

  // 6. QUÉ FALTA MEMORIZAR ("falta", "pendiente", "queda", "memorizar", "olvidé")
  if (matchesAny(rawTokens, ['falta', 'pendiente', 'memoriz', 'queda', 'olvid', 'aprender', 'incompleto'])) {
    if (unmemorizedInRoom.length > 0) {
      const nextPiece = unmemorizedInRoom[0]
      return {
        text: `Aris: En esta sala aún te falta dominar "${nextPiece.title}". Acércate a su pedestal y presiona la tecla M cuando lo hayas fijado en tu memoria.`,
      }
    } else {
      const remainingGlobal = allPieces.filter((p) => !memorized[p.id])
      if (remainingGlobal.length === 0) {
        return {
          text: 'Aris: ¡Completaste todo el palacio! Has memorizado cada concepto. Ya estás preparado para afrontar el Modo Examen.',
        }
      }
      return {
        text: `Aris: ¡Dominas el 100% de esta sala! Ya aprendiste los conceptos de "${currentRoom.name}". Sigue el pasillo hacia la siguiente habitación.`,
      }
    }
  }

  // 7. SIGUIENTE PASO / RUTA ("siguiente", "sigue", "después", "adónde", "ruta", "camino")
  if (matchesAny(rawTokens, ['siguiente', 'sigue', 'despues', 'después', 'proximo', 'próximo', 'adonde', 'adónde', 'ruta', 'camino'])) {
    if (currentIndex < palace.rooms.length - 1) {
      const nextRoom = palace.rooms[currentIndex + 1]
      return {
        text: `Aris: Tu siguiente destino es la Sala ${currentIndex + 2}: "${nextRoom.name}". Camina por el pasillo conectado para continuar el orden del recorrido.`,
      }
    } else {
      return {
        text: 'Aris: Estás en la última cámara del palacio. Puedes repasar los pedestales o ingresar al Modo Examen para validar tu retención.',
      }
    }
  }

  // 8. RESUMEN / EXPLICACIÓN DE SALA ("resumen", "trata", "explica", "tema")
  if (matchesAny(rawTokens, ['resumen', 'trata', 'explica', 'tema', 'contenido'])) {
    const totalInRoom = currentPieces.length
    const mastered = currentPieces.filter((p) => memorized[p.id]).length
    return {
      text: `Aris: En "${currentRoom.name}" estudiamos este tema a través de ${totalInRoom} pedestales (llevas ${mastered} memorizados). ${currentRoom.description || 'Recorre cada objeto para asimilar el concepto.'}`,
    }
  }

  // 9. PISTAS / EXAMEN ("pista", "ayuda", "examen", "recordar")
  if (matchesAny(rawTokens, ['pista', 'ayuda', 'examen', 'test', 'recordar'])) {
    if (mode === 'exam') {
      return {
        text: 'Aris: En Modo Examen los títulos están ocultos. Si tienes dudas en un pedestal, presiona "Ver pista" para descubrir la primera letra y su longitud.',
      }
    } else {
      return {
        text: 'Aris: Un consejo mnemotécnico: asocia la forma 3D y el color del pedestal con la idea principal del texto. Esa asociación espacial fija el recuerdo.',
      }
    }
  }

  // 10. Fallback guiado e interactivo con ejemplos reales
  return {
    text: 'Aris: No estoy seguro de entenderte del todo, pero puedes consultarme:\n• "¿Qué me falta memorizar?"\n• "¿Adónde voy ahora?"\n• "¿Dónde está la llave?"\n• "¿Cómo va mi progreso?"',
  }
}

// Síntesis de voz robótica nativa con feedback procedural (0 KB de librerías)
export function speakAris(text: string, muted?: boolean) {
  playArisVoice(text, { muted })
}

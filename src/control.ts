import type { Mode } from './modes'
import type { Positions } from './recording'

/** Reparto del terreno entre los dos equipos: cada celda es de quien tiene el jugador más cercano. */
export interface Control {
  cols: number
  rows: number
  /** Por celda: 0 = rojo, 1 = azul, -1 = nadie. */
  owner: Int8Array
  /** Fracción del terreno (0..1) que domina cada equipo. */
  left: number
  right: number
}

const COLS = 88

/**
 * Espacio controlado (diagrama de Voronoi): se muestrea el terreno en una rejilla y cada celda se asigna al
 * equipo del jugador más cercano, medido en metros. Solo cuentan las fichas de los dos equipos.
 */
export function computeControl(positions: Positions, mode: Mode, scratch?: Int8Array): Control {
  const cols = COLS
  const rows = Math.max(8, Math.round((COLS * mode.width) / mode.length))
  // Con `scratch` (el dibujo, que lo pide en cada fotograma) no se reserva memoria nueva.
  const owner = scratch && scratch.length === cols * rows ? scratch : new Int8Array(cols * rows)
  owner.fill(-1)
  const px: number[] = []
  const py: number[] = []
  const team: number[] = []
  for (const [key, p] of Object.entries(positions)) {
    const side = key.startsWith('left-') ? 0 : key.startsWith('right-') ? 1 : -1
    if (side < 0) continue
    px.push(p.x * mode.length)
    py.push(p.y * mode.width)
    team.push(side)
  }
  const n = px.length
  let left = 0
  let right = 0
  if (n > 0) {
    const cellW = mode.length / cols
    const cellH = mode.width / rows
    for (let j = 0; j < rows; j++) {
      const y = (j + 0.5) * cellH
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * cellW
        let best = Infinity
        let owned = 0
        for (let k = 0; k < n; k++) {
          const dx = px[k] - x
          const dy = py[k] - y
          const d = dx * dx + dy * dy
          if (d < best) {
            best = d
            owned = team[k]
          }
        }
        owner[j * cols + i] = owned
        if (owned === 0) left++
        else right++
      }
    }
  }
  const total = cols * rows
  return { cols, rows, owner, left: left / total, right: right / total }
}

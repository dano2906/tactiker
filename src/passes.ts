import { positionsAt, totalDuration, type Movement, type Positions } from './recording'

export interface PassEdge {
  from: string
  to: string
  count: number
}

export interface PassNode {
  key: string
  /** Posición media durante la jugada (0..1). */
  x: number
  y: number
  /** Pases que da y recibe. */
  sent: number
  received: number
}

export interface PassNetwork {
  edges: PassEdge[]
  nodes: PassNode[]
  total: number
}

const teamOf = (key: string) => (key.startsWith('left-') ? 'left' : key.startsWith('right-') ? 'right' : null)

/**
 * Red de pases de la jugada: un pase es un movimiento del balón (no el que acompaña a un jugador) que va de
 * quien lo tiene a un compañero. Los nodos se colocan en la posición media de cada jugador.
 */
export function passNetwork(start: Positions, movements: Movement[], startCarrier: string | null): PassNetwork {
  const counts = new Map<string, PassEdge>()
  let carrier = startCarrier
  for (const m of movements) {
    if (m.carrierAfter === undefined) continue
    if (m.key === 'ball' && !m.linked && carrier && m.carrierAfter && carrier !== m.carrierAfter) {
      const a = teamOf(carrier)
      if (a && a === teamOf(m.carrierAfter)) {
        const id = `${carrier}>${m.carrierAfter}`
        const edge = counts.get(id) ?? { from: carrier, to: m.carrierAfter, count: 0 }
        edge.count++
        counts.set(id, edge)
      }
    }
    carrier = m.carrierAfter
  }
  const edges = [...counts.values()]
  const involved = new Set(edges.flatMap((e) => [e.from, e.to]))

  // posición media de los implicados a lo largo de toda la jugada
  const total = totalDuration(movements)
  const step = Math.max(150, total / 80)
  const sums = new Map<string, { x: number; y: number; n: number }>()
  for (let t = 0; t <= total; t += step) {
    const at = positionsAt(start, movements, t)
    for (const key of involved) {
      const p = at[key]
      if (!p) continue
      const s = sums.get(key) ?? { x: 0, y: 0, n: 0 }
      s.x += p.x
      s.y += p.y
      s.n++
      sums.set(key, s)
    }
  }
  const nodes: PassNode[] = [...involved].map((key) => {
    const s = sums.get(key)
    return {
      key,
      x: s ? s.x / s.n : (start[key]?.x ?? 0.5),
      y: s ? s.y / s.n : (start[key]?.y ?? 0.5),
      sent: edges.filter((e) => e.from === key).reduce((n, e) => n + e.count, 0),
      received: edges.filter((e) => e.to === key).reduce((n, e) => n + e.count, 0),
    }
  })
  return { edges, nodes, total: edges.reduce((n, e) => n + e.count, 0) }
}


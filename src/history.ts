import type { Annotation } from './annotations'
import type { ModeId, Side, Size, Teams } from './modes'
import type { Movement, Positions } from './recording'
import type { Roster } from './roster'

/**
 * Parte de la jugada activa que se puede deshacer. Todo lo que se edita (fichas, movimientos, dibujos,
 * formaciones, colores, datos de jugadores…) vive aquí; la selección, el zoom o la herramienta no.
 */
export interface DocState {
  modeId: ModeId
  size: Size | null
  teams: Teams
  ball: boolean
  startCarrier: string | null
  colors: Record<Side, string>
  roster: Roster
  start: Positions
  movements: Movement[]
  annotations: Annotation[]
  notes: string
  stepNotes: Record<string, string>
  background: string | null
}

/** Dos estados son iguales si cada campo es el mismo objeto (los estados se tratan como inmutables). */
export function sameDoc(a: DocState, b: DocState): boolean {
  return (Object.keys(a) as (keyof DocState)[]).every((key) => a[key] === b[key])
}

export const HISTORY_LIMIT = 100
/** Los cambios seguidos dentro de este margen (ms) cuentan como un solo paso de historial. */
export const HISTORY_BURST_MS = 400

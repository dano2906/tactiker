import type { Formation, Side } from './modes'
import { theme } from './theme'

/** Datos personalizados de una ficha; lo que falte usa el valor por defecto. */
export interface PlayerInfo {
  dorsal?: number
  name?: string
  role?: string
  /** Tamaño relativo de la ficha (1 = normal). */
  size?: number
}

/** Clave de ficha (`${side}-${slot}`) → datos. El slot es el número original en la formación. */
export type Roster = Record<string, PlayerInfo>

/** Colores de equipo por defecto: los de los tokens (`--team-red`, `--team-blue`). */
export const defaultColors = (): Record<Side, string> => ({ left: theme().red, right: theme().blue })

export type LabelMode = 'none' | 'name' | 'role'

/** Posición por defecto según la línea de la formación en la que cae el slot. */
export function defaultRole(formation: Formation, slot: number): string {
  let remaining = slot
  for (let line = 0; line < formation.lines.length; line++) {
    remaining -= formation.lines[line]
    if (remaining <= 0) {
      if (line === 0) return 'POR'
      if (line === 1) return 'DEF'
      return line === formation.lines.length - 1 ? 'DEL' : 'MED'
    }
  }
  return ''
}

export type TokenKind = Side | 'neutral' | 'ref' | 'ball'

/** Tipo y número de una clave de ficha (`left-3`, `neutral-1`, `ref-1` o `ball`). */
export function parseKey(key: string): { kind: TokenKind; slot: number } {
  if (key === 'ball') return { kind: 'ball', slot: 0 }
  const [kind, slot] = key.split('-')
  return { kind: kind as TokenKind, slot: Number(slot) }
}

export const SIZE_RANGE = [0.6, 1.8] as const

/** Nombre legible de una ficha para títulos y etiquetas. */
export function keyTitle(key: string): string {
  const { kind, slot } = parseKey(key)
  if (kind === 'left') return `Rojo · ficha ${slot}`
  if (kind === 'right') return `Azul · ficha ${slot}`
  if (kind === 'neutral') return `Comodín ${slot}`
  if (kind === 'ref') return `Árbitro ${slot}`
  return 'Balón'
}

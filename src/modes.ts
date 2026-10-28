export type ModeId = 'f4' | 'f5' | 'f7' | 'f11'
export type Side = 'left' | 'right'

export interface Formation {
  /** Identificador legible, ej. `4-4-2` (sin contar al portero). */
  id: string
  /** Líneas tácticas de portero a ataque (la primera línea es el portero). */
  lines: number[]
}

export interface Mode {
  id: ModeId
  label: string
  /** Largo y ancho del terreno en metros. */
  length: number
  width: number
  /** La primera es la formación por defecto. */
  formations: Formation[]
  /** Área grande: profundidad y ancho en metros. */
  areaDepth: number
  areaWidth: number
  centerRadius: number
  goalWidth: number
}

const formation = (...outfield: number[]): Formation => ({
  id: outfield.join('-'),
  lines: [1, ...outfield],
})

export const MODES: Mode[] = [
  {
    id: 'f4', label: 'Fútbol 4', length: 30, width: 20,
    formations: [formation(2, 1), formation(1, 2), formation(1, 1, 1)],
    areaDepth: 5, areaWidth: 10, centerRadius: 3, goalWidth: 3,
  },
  {
    id: 'f5', label: 'Fútbol 5', length: 40, width: 20,
    formations: [formation(2, 2), formation(1, 2, 1), formation(3, 1), formation(2, 1, 1)],
    areaDepth: 6, areaWidth: 12, centerRadius: 3, goalWidth: 3,
  },
  {
    id: 'f7', label: 'Fútbol 7', length: 60, width: 40,
    formations: [formation(2, 3, 1), formation(3, 2, 1), formation(2, 2, 2), formation(3, 3)],
    areaDepth: 10, areaWidth: 22, centerRadius: 6, goalWidth: 6,
  },
  {
    id: 'f11', label: 'Fútbol 11', length: 105, width: 68,
    formations: [
      formation(4, 4, 2), formation(4, 3, 3), formation(3, 5, 2),
      formation(4, 2, 3, 1), formation(5, 3, 2), formation(4, 1, 4, 1),
    ],
    areaDepth: 16.5, areaWidth: 40.3, centerRadius: 9.15, goalWidth: 7.32,
  },
]

export interface Size {
  length: number
  width: number
}

/** Límites de las medidas personalizadas del terreno, en metros. */
export const SIZE_LIMITS = { length: [10, 130], width: [8, 100] } as const

/** Modalidad con las medidas personalizadas; el área, el círculo y la portería escalan en proporción. */
export function withSize(mode: Mode, size: Size | null): Mode {
  if (!size) return mode
  const kl = size.length / mode.length
  const kw = size.width / mode.width
  return {
    ...mode,
    length: size.length,
    width: size.width,
    areaDepth: mode.areaDepth * kl,
    areaWidth: mode.areaWidth * kw,
    goalWidth: mode.goalWidth * kw,
    centerRadius: mode.centerRadius * Math.min(kl, kw),
  }
}

export interface TeamConfig {
  formationId: string
  visible: boolean
}

export type Teams = Record<Side, TeamConfig>

export const SIDES: Side[] = ['left', 'right']

export const SIDE_LABELS: Record<Side, string> = { left: 'Rojo', right: 'Azul' }

export const playerCount = (f: Formation) => f.lines.reduce((a, b) => a + b, 0)

export function defaultTeams(mode: Mode): Teams {
  const id = mode.formations[0].id
  return {
    left: { formationId: id, visible: true },
    right: { formationId: id, visible: true },
  }
}

export function getFormation(mode: Mode, id: string): Formation {
  return mode.formations.find((f) => f.id === id) ?? mode.formations[0]
}

export interface Player {
  number: number
  /** Posición normalizada (0..1) sobre el terreno completo. */
  x: number
  y: number
}

/**
 * Coloca las líneas tácticas (portero incluido) en la mitad del equipo.
 * `side` 'left' ataca hacia la derecha; 'right' es el espejo.
 */
export function layoutTeam(formation: Formation, side: Side): Player[] {
  const flip = (x: number) => (side === 'left' ? x : 1 - x)
  const [keeper, ...lines] = formation.lines
  const players: Player[] = []
  let number = 1
  const addLine = (count: number, x: number) => {
    for (let j = 0; j < count; j++) {
      players.push({ number: number++, x: flip(x), y: (j + 1) / (count + 1) })
    }
  }
  addLine(keeper, 0.06)
  lines.forEach((count, i) => {
    const t = lines.length === 1 ? 0.5 : i / (lines.length - 1)
    addLine(count, 0.2 + t * 0.24)
  })
  return players
}

/** Claves de ficha de cada línea de campo (sin portero), de defensa a ataque. */
export function lineKeys(formation: Formation, side: Side): string[][] {
  let slot = formation.lines[0]
  return formation.lines.slice(1).map((count) =>
    Array.from({ length: count }, () => `${side}-${++slot}`),
  )
}

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

/** Jugadores de campo (sin portero) de cada equipo en esta modalidad. */
const outfieldCount = (mode: Mode) => playerCount(mode.formations[0]) - 1

/**
 * Formación a partir de su identificador (`3-5-2`): vale cualquiera que sume los jugadores de campo de la
 * modalidad, con entre 2 y 5 líneas de 1 a 9 jugadores. Así las formaciones propias se describen solas.
 */
export function parseFormationId(mode: Mode, id: string): Formation | null {
  if (!/^[1-9](-[1-9]){1,4}$/.test(id)) return null
  const lines = id.split('-').map(Number)
  return lines.reduce((a, b) => a + b, 0) === outfieldCount(mode) ? { id, lines: [1, ...lines] } : null
}

export function getFormation(mode: Mode, id: string): Formation {
  return mode.formations.find((f) => f.id === id) ?? parseFormationId(mode, id) ?? mode.formations[0]
}

export const isFormationId = (mode: Mode, id: string) =>
  mode.formations.some((f) => f.id === id) || parseFormationId(mode, id) !== null

// ---------- formaciones propias (se guardan en este dispositivo) ----------

const CUSTOM_KEY = 'tactiker.formations'

function readCustom(): Partial<Record<ModeId, string[]>> {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '{}')
    return typeof raw === 'object' && raw ? raw : {}
  } catch {
    return {}
  }
}

function writeCustom(all: Partial<Record<ModeId, string[]>>) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(all))
  } catch {
    // sin almacenamiento: la formación sirve en esta sesión pero no se recuerda
  }
}

/** Formaciones de la modalidad: las que trae más las propias. */
export function formationsOf(mode: Mode): Formation[] {
  const custom = (readCustom()[mode.id] ?? [])
    .map((id) => parseFormationId(mode, id))
    .filter((f): f is Formation => f !== null && !mode.formations.some((b) => b.id === f.id))
  return [...mode.formations, ...custom]
}

/** Añade una formación propia escrita como `3-5-2`, `352` o `3 5 2`. */
export function addCustomFormation(mode: Mode, text: string): { ok: true; id: string } | { ok: false; error: string } {
  const digits = text.match(/\d/g)
  const id = text.includes('-') || /[\s,]/.test(text.trim()) ? text.trim().split(/[-\s,]+/).join('-') : digits?.join('-') ?? ''
  const formation = parseFormationId(mode, id)
  if (!formation) {
    return { ok: false, error: `Escribe ${outfieldCount(mode)} jugadores de campo repartidos en 2 a 5 líneas, por ejemplo ${mode.formations[0].id}.` }
  }
  if (formationsOf(mode).some((f) => f.id === formation.id)) return { ok: false, error: 'Esa formación ya existe.' }
  const all = readCustom()
  all[mode.id] = [...(all[mode.id] ?? []), formation.id]
  writeCustom(all)
  return { ok: true, id: formation.id }
}

export function removeCustomFormation(mode: Mode, id: string) {
  const all = readCustom()
  all[mode.id] = (all[mode.id] ?? []).filter((x) => x !== id)
  writeCustom(all)
}

export const isCustomFormation = (mode: Mode, id: string) => !mode.formations.some((f) => f.id === id)

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

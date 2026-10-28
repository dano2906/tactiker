import { MODES, SIDES, SIZE_LIMITS, defaultTeams, isFormationId, type ModeId, type Side, type Size, type Teams } from './modes'
import { BALL_KEY, type Movement, type PathPoint, type Positions } from './recording'
import { defaultColors, type Roster } from './roster'
import type { Annotation } from './annotations'
import { parseSession, type SessionItem } from './session'
import { safeName } from './exporting'

const STORAGE_KEY = 'tactiker.tactics'

/** Una jugada: configuración del terreno, posición inicial, movimientos y dibujos. */
export interface SceneData {
  modeId: ModeId
  teams: Teams
  /** Medidas personalizadas del terreno (`null` = las de la modalidad). */
  size: Size | null
  ball: boolean
  /** Poseedor del balón al empezar la jugada. */
  carrier: string | null
  colors: Record<Side, string>
  roster: Roster
  start: Positions
  movements: Movement[]
  annotations: Annotation[]
  /** Notas de la jugada y notas de cada paso (clave: número de paso). */
  notes: string
  stepNotes: Record<string, string>
  /** Imagen de fondo (data URL) en lugar del césped; no viaja en los enlaces para compartir. */
  background: string | null
}

export interface Scene extends SceneData {
  name: string
}

/** Una táctica es una secuencia de jugadas. */
export interface Tactic {
  id: string
  name: string
  scenes: Scene[]
  savedAt: number
  /** Etiquetas para encontrarla en la biblioteca. */
  tags?: string[]
  /** Sesión de entrenamiento ligada a la táctica. */
  session?: SessionItem[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function parsePath(v: unknown): PathPoint[] | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const path: PathPoint[] = []
  for (const p of v) {
    if (!isRecord(p) || !isNumber(p.x) || !isNumber(p.y) || !isNumber(p.t)) return null
    path.push({ x: p.x, y: p.y, t: p.t })
  }
  return path
}

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
/** Color de dibujo: puede llevar transparencia (#rrggbbaa). */
const isColorAlpha = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)

function parseAnnotations(v: unknown): Annotation[] {
  if (!Array.isArray(v)) return []
  const result: Annotation[] = []
  for (const a of v) {
    if (!isRecord(a)) continue
    const id = typeof a.id === 'string' ? a.id : crypto.randomUUID()
    if ((a.kind === 'arrow' || a.kind === 'zone') && isColorAlpha(a.color) &&
        isNumber(a.x1) && isNumber(a.y1) && isNumber(a.x2) && isNumber(a.y2)) {
      result.push({ id, kind: a.kind, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, color: a.color })
    } else if (a.kind === 'ellipse' && isColorAlpha(a.color) &&
               isNumber(a.x1) && isNumber(a.y1) && isNumber(a.x2) && isNumber(a.y2)) {
      result.push({ id, kind: 'ellipse', x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, color: a.color })
    } else if (a.kind === 'free' && isColorAlpha(a.color) && Array.isArray(a.points) && a.points.length >= 2) {
      const points = a.points
        .filter((p): p is { x: number; y: number } => isRecord(p) && isNumber(p.x) && isNumber(p.y))
        .map((p) => ({ x: p.x, y: p.y }))
      if (points.length >= 2) result.push({ id, kind: 'free', points, arrow: a.arrow === true, color: a.color })
    } else if (a.kind === 'cone' && isNumber(a.x) && isNumber(a.y)) {
      result.push({ id, kind: 'cone', x: a.x, y: a.y })
    } else if (a.kind === 'text' && isColorAlpha(a.color) && isNumber(a.x) && isNumber(a.y) &&
               typeof a.text === 'string') {
      result.push({ id, kind: 'text', x: a.x, y: a.y, text: a.text.slice(0, 60), color: a.color })
    }
  }
  return result
}

function parseStepNotes(v: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!isRecord(v)) return result
  for (const [key, text] of Object.entries(v)) {
    if (/^\d+$/.test(key) && typeof text === 'string' && text.trim()) result[key] = text.slice(0, 400)
  }
  return result
}

/** Solo imágenes en data URL y de tamaño razonable. */
const MAX_BACKGROUND = 3_000_000
function parseBackground(v: unknown): string | null {
  return typeof v === 'string' && v.length <= MAX_BACKGROUND && /^data:image\/(jpeg|png|webp);base64,/.test(v) ? v : null
}

function parseScene(value: unknown, fallbackName: string): Scene | null {
  if (!isRecord(value)) return null
  const mode = MODES.find((m) => m.id === value.modeId)
  if (!mode || !isRecord(value.start) || !Array.isArray(value.movements)) return null

  const start: Positions = {}
  for (const [key, p] of Object.entries(value.start)) {
    if (!(key === BALL_KEY || /^(left|right|neutral|ref)-\d+$/.test(key)) || !isRecord(p) || !isNumber(p.x) || !isNumber(p.y)) {
      return null
    }
    start[key] = { x: p.x, y: p.y }
  }

  const movements: Movement[] = []
  for (const [index, m] of value.movements.entries()) {
    if (!isRecord(m) || typeof m.key !== 'string' || !(m.key in start)) return null
    const path = parsePath(m.path)
    if (!path) return null
    // Sin `step` (guardado antiguo) cada movimiento era su propio paso.
    movements.push({
      key: m.key,
      path,
      step: isNumber(m.step) ? m.step : index,
      ...(typeof m.carrierAfter === 'string' || m.carrierAfter === null
        ? { carrierAfter: m.carrierAfter }
        : {}),
      ...(m.linked === true && { linked: true }),
      ...(isNumber(m.delay) && m.delay > 0 && { delay: m.delay }),
    })
  }

  const teams = defaultTeams(mode)
  if (isRecord(value.teams)) {
    for (const side of SIDES) {
      const t = value.teams[side]
      if (!isRecord(t)) continue
      if (isFormationId(mode, t.formationId as string)) {
        teams[side].formationId = t.formationId as string
      }
      if (typeof t.visible === 'boolean') teams[side].visible = t.visible
    }
  }

  let size: Size | null = null
  if (isRecord(value.size) && isNumber(value.size.length) && isNumber(value.size.width)) {
    const [minL, maxL] = SIZE_LIMITS.length
    const [minW, maxW] = SIZE_LIMITS.width
    if (value.size.length >= minL && value.size.length <= maxL &&
        value.size.width >= minW && value.size.width <= maxW) {
      size = { length: value.size.length, width: value.size.width }
    }
  }
  const carrier =
    typeof value.carrier === 'string' && value.carrier in start && value.carrier !== BALL_KEY
      ? value.carrier
      : null

  const colors = defaultColors()
  if (isRecord(value.colors)) {
    for (const side of SIDES) {
      const c = value.colors[side]
      if (isColor(c)) colors[side] = c
    }
  }

  const roster: Roster = {}
  if (isRecord(value.roster)) {
    for (const [key, info] of Object.entries(value.roster)) {
      if (!/^(left|right|neutral|ref)-\d+$/.test(key) || !isRecord(info)) continue
      roster[key] = {
        ...(isNumber(info.dorsal) && { dorsal: info.dorsal }),
        ...(typeof info.name === 'string' && { name: info.name.slice(0, 30) }),
        ...(typeof info.role === 'string' && { role: info.role.slice(0, 6) }),
        ...(isNumber(info.size) && info.size >= 0.5 && info.size <= 2 && { size: info.size }),
        ...(typeof info.squadId === 'string' && { squadId: info.squadId.slice(0, 60) }),
        ...(typeof info.photo === 'string' && info.photo.startsWith('data:image/') && info.photo.length < 80_000 && { photo: info.photo }),
      }
    }
  }

  return {
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 40) : fallbackName,
    modeId: mode.id,
    teams,
    ball: typeof value.ball === 'boolean' ? value.ball : BALL_KEY in start,
    size,
    carrier,
    colors,
    roster,
    start,
    movements,
    annotations: parseAnnotations(value.annotations),
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 2000) : '',
    stepNotes: parseStepNotes(value.stepNotes),
    background: parseBackground(value.background),
  }
}

/** Valida un valor desconocido (localStorage o archivo importado). */
export function parseTactic(value: unknown): Tactic | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null
  // Las tácticas antiguas eran una sola jugada guardada en la propia táctica.
  const rawScenes = Array.isArray(value.scenes) ? value.scenes : [value]
  const scenes = rawScenes
    .map((s, i) => parseScene(s, `Jugada ${i + 1}`))
    .filter((s): s is Scene => s !== null)
  if (scenes.length === 0) return null
  if (!Array.isArray(value.scenes)) scenes[0].name = 'Jugada 1'
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    name: value.name.trim() || 'Sin nombre',
    scenes,
    savedAt: isNumber(value.savedAt) ? value.savedAt : Date.now(),
    ...(Array.isArray(value.tags) ? { tags: value.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 24)).filter(Boolean).slice(0, 8) } : {}),
    ...(Array.isArray(value.session) && value.session.length ? { session: parseSession(value.session) } : {}),
  }
}

/** Acepta una táctica suelta o una lista; descarta las inválidas. */
export function parseTactics(value: unknown): Tactic[] {
  const items = Array.isArray(value) ? value : [value]
  return items.map(parseTactic).filter((t): t is Tactic => t !== null)
}

export function loadTactics(): Tactic[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? parseTactics(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function persistTactics(tactics: Tactic[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tactics))
  } catch {
    // Almacenamiento no disponible o lleno: la sesión sigue funcionando.
  }
}

export function downloadTactic(tactic: Tactic) {
  const blob = new Blob([JSON.stringify(tactic, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(tactic.name)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

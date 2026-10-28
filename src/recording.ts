import { getFormation, layoutTeam, SIDES, type Mode, type Teams } from './modes'

export interface Point {
  x: number
  y: number
}

/** Posiciones normalizadas (0..1) por ficha, con clave `${side}-${number}`. */
export type Positions = Record<string, Point>

export interface PathPoint extends Point {
  /** Milisegundos desde que se empezó a arrastrar la ficha. */
  t: number
}

/** Un movimiento = un arrastre de una ficha, con su trayectoria. */
export interface Movement {
  key: string
  path: PathPoint[]
  /**
   * Paso al que pertenece. Los movimientos con el mismo paso se reproducen a
   * la vez; los pasos se reproducen uno tras otro. Si una ficha tiene varios
   * movimientos en un mismo paso, se encadenan.
   */
  step: number
  /** Poseedor del balón tras este movimiento (`null` = balón libre); sin definir, no cambia. */
  carrierAfter?: string | null
  /** Movimiento del balón generado automáticamente por llevarlo un jugador. */
  linked?: boolean
  /** Pausa (ms) antes de empezar, dentro de su paso; se suma al final del movimiento anterior de la misma ficha. */
  delay?: number
}

/** Pausa entre pasos consecutivos durante la reproducción. */
const GAP_MS = 250
const MIN_DURATION_MS = 300

/** Distancia de `p` al segmento `a`-`b` (mismas unidades que los puntos). */
function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy))
}

/** Ramer–Douglas–Peucker: devuelve los índices de los puntos que se conservan. */
function simplify(points: Point[], epsilon: number): number[] {
  const keep = new Set([0, points.length - 1])
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [from, to] = stack.pop()!
    let worst = -1
    let worstDist = epsilon
    for (let i = from + 1; i < to; i++) {
      const d = distanceToSegment(points[i], points[from], points[to])
      if (d > worstDist) {
        worst = i
        worstDist = d
      }
    }
    if (worst !== -1) {
      keep.add(worst)
      stack.push([from, worst], [worst, to])
    }
  }
  return [...keep].sort((a, b) => a - b)
}

/**
 * Endereza la trayectoria grabada: elimina los zigzags de la mano conservando
 * inicio, final y los giros reales. La tolerancia se mide en metros para que sea
 * igual de exigente en todas las modalidades. La duración total se mantiene y
 * los tiempos se redistribuyen según la distancia para un movimiento fluido.
 */
export function straighten(path: PathPoint[], mode: Mode): PathPoint[] {
  const epsilon = mode.width * 0.03
  const meters = path.map((p) => ({ x: p.x * mode.length, y: p.y * mode.width }))
  const kept = simplify(meters, epsilon)
  if (kept.length === path.length && path.length <= 2) return path

  const total = path[path.length - 1].t
  const cumulative = [0]
  for (let i = 1; i < kept.length; i++) {
    const a = meters[kept[i - 1]]
    const b = meters[kept[i]]
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y))
  }
  const length = cumulative[cumulative.length - 1] || 1
  return kept.map((index, i) => ({
    x: path[index].x,
    y: path[index].y,
    t: (cumulative[i] / length) * total,
  }))
}

export const BALL_KEY = 'ball'

export function initialPositions(mode: Mode, teams: Teams, ball: boolean): Positions {
  const positions: Positions = {}
  for (const side of SIDES) {
    if (!teams[side].visible) continue
    const formation = getFormation(mode, teams[side].formationId)
    for (const p of layoutTeam(formation, side)) {
      positions[`${side}-${p.number}`] = { x: p.x, y: p.y }
    }
  }
  if (ball) positions[BALL_KEY] = { x: 0.5, y: 0.5 }
  return positions
}

function durationOf(m: Movement) {
  return Math.max(MIN_DURATION_MS, m.path[m.path.length - 1].t)
}

/** Quién lleva el balón después de `movements`, partiendo de `startCarrier`. */
export function carrierAt(startCarrier: string | null, movements: Movement[]): string | null {
  let carrier = startCarrier
  for (const m of movements) if (m.carrierAfter !== undefined) carrier = m.carrierAfter
  return carrier
}

export interface MovementStats {
  /** Metros recorridos. */
  distance: number
  /** Segundos que dura en la reproducción. */
  seconds: number
  speedKmh: number
}

export function movementStats(m: Movement, mode: Mode): MovementStats {
  let distance = 0
  for (let i = 1; i < m.path.length; i++) {
    distance += Math.hypot(
      (m.path[i].x - m.path[i - 1].x) * mode.length,
      (m.path[i].y - m.path[i - 1].y) * mode.width,
    )
  }
  const seconds = durationOf(m) / 1000
  return { distance, seconds, speedKmh: (distance / seconds) * 3.6 }
}

/** Agrupa los movimientos consecutivos que comparten paso. */
export function groupSteps(movements: Movement[]): Movement[][] {
  const steps: Movement[][] = []
  for (const m of movements) {
    const last = steps[steps.length - 1]
    if (last && last[0].step === m.step) last.push(m)
    else steps.push([m])
  }
  return steps
}

/** Un paso ya preparado para reproducir: movimientos por ficha y duraciones precalculadas. */
interface PreparedStep {
  duration: number
  /** `starts[i]`: instante (ms desde el comienzo del paso) en que arranca `moves[i]`, pausa incluida. */
  groups: { moves: Movement[]; durations: number[]; starts: number[] }[]
}

// La reproducción pide el estado en cada fotograma: la preparación se calcula una vez por lista de movimientos.
const preparedCache = new WeakMap<Movement[], PreparedStep[]>()

function prepare(movements: Movement[]): PreparedStep[] {
  const cached = preparedCache.get(movements)
  if (cached) return cached
  const prepared = groupSteps(movements).map((step) => {
    const byKey = new Map<string, Movement[]>()
    for (const m of step) {
      const list = byKey.get(m.key)
      if (list) list.push(m)
      else byKey.set(m.key, [m])
    }
    const groups = [...byKey.values()].map((moves) => {
      const durations = moves.map(durationOf)
      const starts: number[] = []
      let offset = 0
      moves.forEach((m, i) => {
        offset += m.delay ?? 0
        starts.push(offset)
        offset += durations[i]
      })
      return { moves, durations, starts, end: offset }
    })
    const duration = Math.max(...groups.map((g) => g.end))
    return { duration, groups }
  })
  preparedCache.set(movements, prepared)
  return prepared
}

/** Duración de la reproducción completa (sin pausa tras el último paso). */
export function totalDuration(movements: Movement[]) {
  const steps = prepare(movements)
  if (steps.length === 0) return 0
  return steps.reduce((sum, s) => sum + s.duration, 0) + GAP_MS * (steps.length - 1)
}

/** Instantes en que empieza la reproducción y termina cada paso. */
export function boundaries(movements: Movement[]): number[] {
  const result = [0]
  let cursor = 0
  for (const step of prepare(movements)) {
    cursor += step.duration
    result.push(cursor)
    cursor += GAP_MS
  }
  return result
}

/** Posición interpolada de una trayectoria; `progress` va de 0 a 1. */
function sample(path: PathPoint[], progress: number): Point {
  const end = path[path.length - 1].t
  const t = progress * end
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = path[i - 1]
      const b = path[i]
      const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
  }
  const last = path[path.length - 1]
  return { x: last.x, y: last.y }
}

/** Aplica un paso `local` ms después de su comienzo: todas las fichas a la vez. */
function applyStep(result: Positions, step: PreparedStep, local: number) {
  for (const { moves, durations, starts } of step.groups) {
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]
      const begin = starts[i]
      const duration = durations[i]
      if (local >= begin + duration) {
        const last = m.path[m.path.length - 1]
        result[m.key] = { x: last.x, y: last.y }
      } else {
        if (local > begin) result[m.key] = sample(m.path, (local - begin) / duration)
        break
      }
    }
  }
}

/** Estado del terreno `elapsed` ms después de empezar la reproducción. */
export function positionsAt(
  start: Positions,
  movements: Movement[],
  elapsed: number,
): Positions {
  const result: Positions = { ...start }
  let cursor = 0
  for (const step of prepare(movements)) {
    const local = elapsed - cursor
    if (local <= 0) break
    applyStep(result, step, Math.min(local, step.duration))
    if (local < step.duration) break
    cursor += step.duration + GAP_MS
  }
  return result
}

export interface ScheduledMovement {
  /** Índice en la lista de movimientos. */
  index: number
  key: string
  /** Instantes absolutos (ms desde el inicio de la jugada). */
  start: number
  end: number
}

/** Cuándo empieza y termina cada movimiento dentro de la jugada (para la línea de tiempo). */
export function schedule(movements: Movement[]): ScheduledMovement[] {
  const indexOf = new Map(movements.map((m, i) => [m, i]))
  const result: ScheduledMovement[] = []
  let cursor = 0
  for (const step of prepare(movements)) {
    for (const { moves, durations, starts } of step.groups) {
      moves.forEach((m, i) => {
        result.push({
          index: indexOf.get(m)!,
          key: m.key,
          start: cursor + starts[i],
          end: cursor + starts[i] + durations[i],
        })
      })
    }
    cursor += step.duration + GAP_MS
  }
  return result.sort((a, b) => a.index - b.index)
}

/** Duración mínima de un movimiento (ms). */
export const MIN_DURATION = MIN_DURATION_MS

/** Escala los tiempos de una trayectoria para que dure `totalMs` (nunca menos del mínimo). */
export function rescalePath(path: PathPoint[], totalMs: number): PathPoint[] {
  const target = Math.max(MIN_DURATION_MS, totalMs)
  const current = path[path.length - 1].t
  if (current <= 0) return path.map((p, i) => ({ ...p, t: (i / (path.length - 1)) * target }))
  const k = target / current
  return path.map((p) => ({ ...p, t: p.t * k }))
}

/** Reparte los tiempos de unos puntos según la distancia recorrida, para que duren `totalMs` en total. */
export function retimePoints(points: Point[], mode: Mode, totalMs: number): PathPoint[] {
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot((points[i].x - points[i - 1].x) * mode.length, (points[i].y - points[i - 1].y) * mode.width),
    )
  }
  const length = cumulative[cumulative.length - 1] || 1
  return points.map((p, i) => ({ x: p.x, y: p.y, t: (cumulative[i] / length) * totalMs }))
}

/** Ajusta la duración de la trayectoria para que su velocidad media sea `kmh`. */
export function paceToSpeed(path: PathPoint[], mode: Mode, kmh: number): PathPoint[] {
  let distance = 0
  for (let i = 1; i < path.length; i++) {
    distance += Math.hypot(
      (path[i].x - path[i - 1].x) * mode.length,
      (path[i].y - path[i - 1].y) * mode.width,
    )
  }
  return rescalePath(path, (distance / (kmh / 3.6)) * 1000)
}

export interface MovementEdit {
  /** Duración en ms. */
  duration?: number
  /** Pausa antes de empezar, en ms. */
  delay?: number
  /** Nuevos puntos de la trayectoria (se conserva la duración). */
  points?: Point[]
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Índice del movimiento del balón que acompaña al del jugador `index`, si lo hay. */
function linkedPartner(movements: Movement[], index: number): number | null {
  const next = movements[index + 1]
  return next?.linked && next.step === movements[index].step ? index + 1 : null
}

/** Aplica una edición al movimiento `index` y a su pareja del balón (si el jugador lo lleva). */
export function editMovement(
  movements: Movement[],
  index: number,
  edit: MovementEdit,
  mode: Mode,
): Movement[] {
  const target = movements[index]
  if (!target || target.linked) return movements
  const partnerIndex = linkedPartner(movements, index)
  const partner = partnerIndex === null ? null : movements[partnerIndex]

  let path = target.path
  if (edit.points) path = retimePoints(edit.points, mode, path[path.length - 1].t)
  if (edit.duration !== undefined) path = rescalePath(path, edit.duration)
  const delay = edit.delay === undefined ? target.delay : Math.max(0, edit.delay)

  const next = [...movements]
  next[index] = { ...target, path, ...(delay ? { delay } : { delay: undefined }) }
  if (partner && partnerIndex !== null) {
    // El balón conserva su distancia respecto al jugador a lo largo de todo el recorrido.
    const dx = partner.path[0].x - target.path[0].x
    const dy = partner.path[0].y - target.path[0].y
    next[partnerIndex] = {
      ...partner,
      path: path.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy), t: p.t })),
      ...(delay ? { delay } : { delay: undefined }),
    }
  }
  return next
}

/** ¿Se puede borrar el movimiento? Solo si ninguno posterior de esas fichas parte de donde acaba este. */
export function canRemoveMovement(movements: Movement[], index: number): boolean {
  const target = movements[index]
  if (!target || target.linked) return false
  const partnerIndex = linkedPartner(movements, index)
  const keys = new Set([target.key, ...(partnerIndex === null ? [] : [movements[partnerIndex].key])])
  return !movements.some((m, i) => i > index && i !== partnerIndex && keys.has(m.key))
}

export function removeMovement(movements: Movement[], index: number): Movement[] {
  const partnerIndex = linkedPartner(movements, index)
  return movements.filter((_, i) => i !== index && i !== partnerIndex)
}

/** ¿Se puede mover el último punto? Solo si ese movimiento es el último de su ficha. */
export function canMoveEnd(movements: Movement[], index: number): boolean {
  const key = movements[index]?.key
  return !movements.some((m, i) => i > index && m.key === key && !m.linked)
}

/**
 * Pega movimientos copiados al final de la jugada. Cada recorrido se traslada para partir de donde
 * está ahora esa ficha, conservando su forma, tiempos y orden; los pasos se numeran a continuación.
 */
export function pasteMovements(
  clipboard: Movement[],
  existing: Movement[],
  current: Positions,
): Movement[] {
  if (clipboard.length === 0) return []
  const minStep = Math.min(...clipboard.map((m) => m.step))
  const base = existing.length ? existing[existing.length - 1].step + 1 : 0
  const where: Positions = { ...current }
  const pasted: Movement[] = []
  for (const m of clipboard) {
    const from = where[m.key]
    if (!from) continue
    const dx = from.x - m.path[0].x
    const dy = from.y - m.path[0].y
    const path = m.path.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy), t: p.t }))
    const end = path[path.length - 1]
    where[m.key] = { x: end.x, y: end.y }
    pasted.push({ ...m, path, step: base + (m.step - minStep) })
  }
  return pasted
}

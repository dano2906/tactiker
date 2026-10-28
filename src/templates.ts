import { getFormation, lineKeys, type Mode, type Teams } from './modes'
import {
  BALL_KEY, initialPositions, retimePoints, type Movement, type Point, type Positions,
} from './recording'

export interface TemplateResult {
  start: Positions
  movements: Movement[]
  /** Quién tiene el balón al empezar. */
  carrier: string | null
}

export interface Template {
  id: string
  build: (mode: Mode, teams: Teams) => TemplateResult
}

type XY = [number, number]

/** Distancia (m) a la que el balón queda pegado a quien lo lleva (igual que al grabar). */
const BALL_OFFSET_M = 1.4

/**
 * Construye una jugada: coloca fichas y encadena movimientos continuos (cada recorrido parte de donde
 * quedó la ficha). El rojo ataca hacia la derecha y el azul defiende; si una modalidad no tiene
 * suficientes jugadores, lo que dependa de las fichas que faltan se omite.
 */
class Builder {
  readonly start: Positions
  readonly movements: Movement[] = []
  /** Quién lleva ahora el balón (cambia a medida que se encadenan movimientos). */
  private carrier: string | null = null
  /** Poseedor al empezar la jugada: el de la última llamada a `giveBall` antes de los movimientos. */
  private startCarrier: string | null = null
  private mode: Mode
  private current: Positions
  private step = 0

  /** Rojos de campo, del más adelantado al más retrasado. */
  readonly attackers: string[]
  /** Líneas de campo del rojo, de defensa a ataque. */
  readonly redLines: string[][]
  /** Líneas de campo del azul, de defensa a ataque. */
  readonly blueLines: string[][]

  constructor(mode: Mode, teams: Teams) {
    this.mode = mode
    const both: Teams = {
      left: { ...teams.left, visible: true },
      right: { ...teams.right, visible: true },
    }
    this.start = initialPositions(mode, both, true)
    this.current = { ...this.start }
    this.redLines = lineKeys(getFormation(mode, both.left.formationId), 'left')
    this.blueLines = lineKeys(getFormation(mode, both.right.formationId), 'right')
    this.attackers = this.redLines.flat().reverse()
  }

  private has(key: string | undefined): key is string {
    return key !== undefined && key in this.current
  }

  private offset(key: string) {
    return ((key.startsWith('left') ? 1 : -1) * BALL_OFFSET_M) / this.mode.length
  }

  /** Coloca una ficha en la posición inicial. */
  place(key: string | undefined, x: number, y: number) {
    if (!this.has(key)) return
    this.start[key] = { x, y }
    this.current[key] = { x, y }
  }

  /** Pega el balón a quien lo lleva, también en la posición inicial. */
  giveBall(key: string | undefined) {
    if (!this.has(key)) return
    const p = this.current[key]
    this.place(BALL_KEY, p.x + this.offset(key), p.y)
    this.carrier = key
    this.startCarrier = key
  }

  /** Posición actual (tras los movimientos ya encadenados) de una ficha. */
  startX(key: string) {
    return this.current[key]?.x ?? 0.5
  }

  startY(key: string) {
    return this.current[key]?.y ?? 0.5
  }

  nextStep() {
    this.step++
  }

  private push(key: string, points: Point[], ms: number, extra: Partial<Movement> = {}) {
    const path = retimePoints([this.current[key], ...points], this.mode, ms)
    this.movements.push({ key, path, step: this.step, ...extra })
    const end = path[path.length - 1]
    this.current[key] = { x: end.x, y: end.y }
  }

  /** Una ficha corre por los puntos indicados. */
  run(key: string | undefined, to: XY[], ms: number) {
    if (!this.has(key)) return
    this.push(key, to.map(([x, y]) => ({ x, y })), ms)
  }

  /** Una ficha conduce el balón: el balón la acompaña. */
  dribble(key: string | undefined, to: XY[], ms: number) {
    if (!this.has(key) || this.carrier !== key || !(BALL_KEY in this.current)) return
    const before = this.current[key]
    const gap = { x: this.current[BALL_KEY].x - before.x, y: this.current[BALL_KEY].y - before.y }
    this.push(key, to.map(([x, y]) => ({ x, y })), ms)
    const player = this.movements[this.movements.length - 1]
    this.push(
      BALL_KEY,
      player.path.slice(1).map((p) => ({ x: p.x + gap.x, y: p.y + gap.y })),
      ms,
      { carrierAfter: key, linked: true },
    )
  }

  /** Pase o disparo del balón hacia una ficha (se le pega) o hacia un punto. */
  kick(target: string | XY | undefined, ms: number) {
    if (target === undefined || !(BALL_KEY in this.current)) return
    if (typeof target === 'string') {
      if (!this.has(target)) return
      const p = this.current[target]
      this.push(BALL_KEY, [{ x: p.x + this.offset(target), y: p.y }], ms, { carrierAfter: target })
      this.carrier = target
    } else {
      this.push(BALL_KEY, [{ x: target[0], y: target[1] }], ms, { carrierAfter: null })
      this.carrier = null
    }
  }

  result(): TemplateResult {
    return { start: this.start, movements: this.movements, carrier: this.startCarrier }
  }
}

const spread = (n: number, i: number) => (i + 1) / (n + 1)

export const TEMPLATES: Template[] = [
  {
    id: 'corner',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const [taker, ...rest] = b.attackers.length > 5 ? [b.attackers[5], ...b.attackers.slice(0, 5)] : b.attackers
      const [a1, a2, a3, a4] = rest
      const d = b.blueLines.flat()
      b.place(taker, 0.985, 0.025)
      b.place(BALL_KEY, 0.995, 0.012)
      b.place(a1, 0.9, 0.4)
      b.place(a2, 0.915, 0.52)
      b.place(a3, 0.88, 0.6)
      b.place(a4, 0.82, 0.45)
      ;[[0.94, 0.4], [0.945, 0.5], [0.93, 0.58], [0.9, 0.46], [0.97, 0.33]].forEach(([x, y], i) => b.place(d[i], x, y))
      b.place('right-1', 0.975, 0.5)
      b.run(a2, [[0.945, 0.46]], 1400)
      b.run(a1, [[0.93, 0.55]], 1400)
      b.run(d[0], [[0.935, 0.43]], 1200)
      b.run(d[1], [[0.94, 0.52]], 1200)
      b.nextStep()
      b.kick(a2, 1200)
      b.nextStep()
      b.kick([1.0, 0.45], 500)
      b.run('right-1', [[0.985, 0.46]], 600)
      return b.result()
    },
  },
  {
    id: 'throw-in',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const [a, bb, thrower, c] = [b.attackers[0], b.attackers[1], b.attackers[2] ?? b.attackers[0], b.attackers[3]]
      const d = b.blueLines.flat()
      b.place(thrower, 0.55, 0.01)
      b.giveBall(thrower)
      b.place(a, 0.62, 0.2)
      b.place(bb, 0.5, 0.22)
      b.place(c, 0.66, 0.45)
      ;[[0.64, 0.22], [0.52, 0.26], [0.68, 0.42]].forEach(([x, y], i) => b.place(d[i], x, y))
      b.run(a, [[0.68, 0.3]], 1500)
      b.run(bb, [[0.45, 0.3]], 1500)
      b.run(d[0], [[0.67, 0.28]], 1500)
      b.nextStep()
      b.kick(a, 900)
      b.nextStep()
      b.kick(c, 900)
      b.run(c, [[0.8, 0.45]], 1500)
      return b.result()
    },
  },
  {
    id: 'buildup',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const [defense, midfield] = b.redLines
      const pressers = b.blueLines[b.blueLines.length - 1] ?? []
      b.place('left-1', 0.04, 0.5)
      b.giveBall('left-1')
      defense?.forEach((k, i) => b.place(k, 0.12, spread(defense.length, i)))
      midfield?.forEach((k, i) => b.place(k, 0.3, spread(midfield.length, i)))
      pressers.forEach((k, i) => b.place(k, 0.4, spread(pressers.length, i)))
      b.run(midfield?.[0], [[0.33, 0.5]], 1600)
      defense?.forEach((k, i) => i === defense.length - 1 && b.run(k, [[0.16, 0.9]], 1600))
      pressers.forEach((k, i) => b.run(k, [[0.32, spread(pressers.length, i)]], 1800))
      b.nextStep()
      b.kick(defense?.[0], 900)
      b.nextStep()
      b.kick(midfield?.[0] ?? defense?.[defense.length - 1], 1000)
      return b.result()
    },
  },
  {
    id: 'counter',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const [wing, centre, other] = b.attackers
      const d = b.blueLines.flat()
      b.place(wing, 0.5, 0.25)
      b.place(centre, 0.5, 0.5)
      b.place(other, 0.5, 0.75)
      b.giveBall(centre)
      b.place(d[0], 0.72, 0.4)
      b.place(d[1], 0.72, 0.6)
      b.place('right-1', 0.94, 0.5)
      b.dribble(centre, [[0.68, 0.5]], 2200)
      b.run(wing, [[0.78, 0.2]], 2200)
      b.run(other, [[0.78, 0.8]], 2200)
      b.run(d[0], [[0.78, 0.42]], 2200)
      b.run(d[1], [[0.78, 0.58]], 2200)
      b.nextStep()
      b.kick(wing, 900)
      b.nextStep()
      b.kick([1.0, 0.5], 600)
      b.run('right-1', [[0.97, 0.45]], 600)
      return b.result()
    },
  },
  {
    id: 'high-press',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const [blueDef, blueMid] = b.blueLines
      const [redDef, redMid] = b.redLines
      const [a1, a2, a3] = b.attackers
      b.place('right-1', 0.96, 0.5)
      b.giveBall('right-1')
      blueDef?.forEach((k, i) => b.place(k, 0.86, spread(blueDef.length, i)))
      blueMid?.forEach((k, i) => b.place(k, 0.68, spread(blueMid.length, i)))
      b.place(a1, 0.78, 0.42)
      b.place(a2, 0.78, 0.58)
      b.place(a3, 0.7, 0.5)
      redMid?.forEach((k, i) => b.place(k, 0.58, spread(redMid.length, i)))
      redDef?.forEach((k, i) => b.place(k, 0.46, spread(redDef.length, i)))
      b.run(a1, [[0.88, 0.36]], 1400)
      b.run(a2, [[0.88, 0.64]], 1400)
      b.run(a3, [[0.8, 0.5]], 1400)
      redMid?.forEach((k) => b.run(k, [[0.68, b.startY(k)]], 1400))
      redDef?.forEach((k) => b.run(k, [[0.56, b.startY(k)]], 1400))
      b.nextStep()
      b.kick(blueDef?.[0], 800)
      b.run(a1, [[0.9, 0.3]], 800)
      b.nextStep()
      b.kick(blueDef?.[blueDef.length - 1], 900)
      b.run(a2, [[0.9, 0.7]], 900)
      return b.result()
    },
  },
  {
    id: 'low-block',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const [redDef, redMid] = b.redLines
      const blueAtk = b.blueLines[b.blueLines.length - 1] ?? []
      const carrier = blueAtk[0]
      b.place('left-1', 0.04, 0.5)
      redDef?.forEach((k, i) => b.place(k, 0.13, spread(redDef.length, i)))
      redMid?.forEach((k, i) => b.place(k, 0.24, spread(redMid.length, i)))
      b.attackers.slice(0, 2).forEach((k, i) => b.place(k, 0.34, spread(2, i)))
      b.place(carrier, 0.44, 0.38)
      b.giveBall(carrier)
      b.place(blueAtk[1], 0.34, 0.1)
      b.dribble(carrier, [[0.4, 0.2]], 1500)
      for (const k of [...(redDef ?? []), ...(redMid ?? []), ...b.attackers.slice(0, 2)]) b.run(k, [[b.startX(k), b.startY(k) * 0.72]], 1500)
      b.nextStep()
      b.kick(blueAtk[1], 1000)
      for (const k of [...(redDef ?? []), ...(redMid ?? [])]) b.run(k, [[b.startX(k), b.startY(k) * 0.5]], 1000)
      return b.result()
    },
  },
  {
    id: 'free-kick',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const [taker, a2, a3] = b.attackers
      const d = b.blueLines.flat()
      b.place(taker, 0.8, 0.4)
      b.giveBall(taker)
      ;[0.31, 0.35, 0.39, 0.43].forEach((y, i) => b.place(d[i], 0.885, y))
      b.place('right-1', 0.985, 0.5)
      b.place(a2, 0.92, 0.55)
      b.place(a3, 0.9, 0.62)
      b.run(a2, [[0.95, 0.5]], 900)
      b.run(a3, [[0.93, 0.42]], 900)
      b.nextStep()
      b.kick([1.0, 0.46], 600)
      b.run('right-1', [[0.985, 0.43]], 600)
      return b.result()
    },
  },
  {
    id: 'penalty',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const spot = 1 - (mode.areaDepth * 0.66) / mode.length
      const edge = 1 - (mode.areaDepth + 2.5) / mode.length
      const [taker, ...others] = b.attackers
      b.place(BALL_KEY, spot, 0.5)
      b.place(taker, spot - 0.045, 0.5)
      others.slice(0, 5).forEach((k, i) => b.place(k, edge, 0.3 + i * 0.1))
      b.blueLines.flat().slice(0, 5).forEach((k, i) => b.place(k, edge - 0.012, 0.3 + i * 0.1))
      b.place('right-1', 0.985, 0.5)
      b.run(taker, [[spot - 0.012, 0.5]], 900)
      b.nextStep()
      b.kick([1.0, 0.43], 450)
      b.run('right-1', [[0.985, 0.44]], 450)
      return b.result()
    },
  },
  {
    id: 'overlap',
    build: (mode, teams) => {
      const b = new Builder(mode, teams)
      const winger = b.redLines[1]?.[0] ?? b.attackers[0]
      const fullback = b.redLines[0]?.[0] ?? b.attackers[1]
      const striker = b.attackers[0] === winger ? b.attackers[1] : b.attackers[0]
      const d = b.blueLines.flat()
      b.place(winger, 0.6, 0.14)
      b.giveBall(winger)
      b.place(fullback, 0.5, 0.1)
      b.place(striker, 0.84, 0.45)
      b.place(d[0], 0.7, 0.12)
      b.place(d[1], 0.9, 0.38)
      b.place(d[2], 0.9, 0.55)
      b.dribble(winger, [[0.67, 0.26]], 1500)
      b.run(fullback, [[0.78, 0.05]], 1500)
      b.run(striker, [[0.9, 0.46]], 1500)
      b.nextStep()
      b.kick(fullback, 800)
      b.nextStep()
      b.kick([0.93, 0.46], 800)
      return b.result()
    },
  },
]

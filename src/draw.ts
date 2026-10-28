import { drawEllipse, drawMark, drawZone, type Annotation } from './annotations'
import type { Mode, Side } from './modes'
import { theme } from './theme'
import { movementStats, type Movement, type PathPoint, type Positions } from './recording'

export interface TokenLabel {
  /** Texto dentro de la ficha (dorsal). */
  text: string
  /** Texto bajo la ficha (nombre o posición). */
  caption: string
  /** Tamaño relativo (1 = normal). */
  size?: number
}

/** Posición del terreno dentro del canvas (en píxeles CSS). */
export interface Geometry {
  ox: number
  oy: number
  s: number
  r: number
}

export interface DragView {
  key: string
  path: PathPoint[]
}

/** Capas de análisis táctico que se superponen al terreno. */
export interface Analysis {
  lines: boolean
  block: boolean
  coverage: boolean
}

export interface SceneView {
  mode: Mode
  geo: Geometry
  positions: Positions
  colors: Record<Side, string>
  tokens: Record<string, TokenLabel>
  trails: Movement[]
  selected: string | null
  /** Quien lleva el balón (se marca con un aro). */
  carrier: string | null
  /** Movimiento seleccionado (índice en `trails`) y si se muestran sus tiradores de edición. */
  selectedMovement: number | null
  handles: boolean
  /** ¿Se puede arrastrar el último punto del movimiento seleccionado? */
  endMovable: boolean
  /** Etiquetas de metros y velocidad sobre cada trayectoria. */
  measures: boolean
  analysis: Analysis
  /** Claves de ficha de cada línea de campo (sin portero) por equipo, de defensa a ataque. */
  groups: Record<Side, string[][]>
  annotations: Annotation[]
  /** Flecha o zona que se está dibujando. */
  drawing: Annotation | null
  drags: DragView[]
  /** Otra jugada superpuesta para comparar. */
  ghost: { positions: Positions; trails: Movement[] } | null
}

export const BALL = 'ball'
export const HANDLE_R = 7
export const sideOf = (key: string): Side | null =>
  key.startsWith('left-') ? 'left' : key.startsWith('right-') ? 'right' : null


/** Color de una ficha: el del equipo, amarillo para comodines, oscuro para el árbitro, blanco para el balón. */
export function tokenColor(key: string, colors: Record<Side, string>): string {
  const side = sideOf(key)
  if (side) return colors[side]
  if (key.startsWith('neutral-')) return theme().neutral
  if (key.startsWith('ref-')) return theme().referee
  return '#ffffff'
}

/** Zoom y desplazamiento (en píxeles) respecto al encuadre que muestra el terreno entero. */
export interface View {
  zoom: number
  panX: number
  panY: number
}

export const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }
export const MAX_ZOOM = 6
/** Margen alrededor del terreno: se reduce en pantallas pequeñas para aprovechar el espacio. */
const padFor = (cw: number, ch: number) => Math.max(6, Math.min(24, Math.min(cw, ch) * 0.05))

/** Mantiene el terreno a la vista: no se puede arrastrar más allá de sus bordes. */
export function clampView(view: View, mode: Mode, cw: number, ch: number): View {
  const PAD = padFor(cw, ch)
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom))
  const s = Math.min((cw - PAD * 2) / mode.length, (ch - PAD * 2) / mode.width) * zoom
  const limit = (size: number, view: number, pan: number) => {
    const span = size * s
    if (span <= view - PAD * 2) return 0
    const left = (view - span) / 2 // borde del terreno sin desplazar
    return Math.min(PAD - left, Math.max(view - PAD - (left + span), pan))
  }
  return { zoom, panX: limit(mode.length, cw, view.panX), panY: limit(mode.width, ch, view.panY) }
}

export function computeGeometry(mode: Mode, cw: number, ch: number, view: View = DEFAULT_VIEW): Geometry {
  const PAD = padFor(cw, ch)
  const s0 = Math.min((cw - PAD * 2) / mode.length, (ch - PAD * 2) / mode.width)
  const ox0 = (cw - mode.length * s0) / 2
  const oy0 = (ch - mode.width * s0) / 2
  const z = view.zoom
  return {
    ox: cw / 2 + (ox0 - cw / 2) * z + view.panX,
    oy: ch / 2 + (oy0 - ch / 2) * z + view.panY,
    s: s0 * z,
    // las fichas crecen algo con el zoom, sin llegar a seguirlo del todo
    r: Math.max(11, Math.min(20, Math.min(cw, ch) * 0.035)) * Math.min(1 + (z - 1) * 0.35, 2.2),
  }
}

/** Capa estática (césped y líneas): se dibuja una vez por tamaño y se reutiliza en cada fotograma. */
export function renderPitchLayer(
  ctx: CanvasRenderingContext2D,
  mode: Mode,
  geo: Geometry,
  cw: number,
  ch: number,
  /** Mapa de calor: no cambia durante la reproducción, así que se pinta aquí y no en cada fotograma. */
  heat: HTMLCanvasElement | null = null,
) {
  const { ox, oy, s } = geo
  const { length: L, width: W } = mode
  const px = (m: number) => ox + m * s
  const py = (m: number) => oy + m * s

  const t = theme()
  ctx.fillStyle = t.background
  ctx.fillRect(0, 0, cw, ch)

  // césped con franjas
  ctx.fillStyle = t.pitch
  ctx.fillRect(ox, oy, L * s, W * s)
  const stripes = 12
  ctx.fillStyle = t.pitchStripe
  for (let i = 0; i < stripes; i += 2) {
    ctx.fillRect(px((L / stripes) * i), oy, (L / stripes) * s, W * s)
  }

  // líneas
  ctx.strokeStyle = t.pitchLine
  ctx.fillStyle = t.pitchLine
  ctx.lineWidth = Math.max(1.5, s * 0.15)
  ctx.strokeRect(ox, oy, L * s, W * s)
  ctx.beginPath()
  ctx.moveTo(px(L / 2), oy)
  ctx.lineTo(px(L / 2), oy + W * s)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(px(L / 2), py(W / 2), mode.centerRadius * s, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(px(L / 2), py(W / 2), Math.max(2, s * 0.3), 0, Math.PI * 2)
  ctx.fill()

  for (const dir of [1, -1]) {
    const goalX = dir === 1 ? 0 : L
    const edge = (m: number) => px(goalX + dir * m)
    const { areaDepth: d, areaWidth: w, goalWidth: g } = mode
    ctx.strokeRect(dir === 1 ? edge(0) : edge(d), py((W - w) / 2), d * s, w * s)
    // portería
    ctx.fillRect(dir === 1 ? edge(0) - s * 1.2 : edge(0), py((W - g) / 2), s * 1.2, g * s)
    // punto de penalti y semicírculo del área
    const spot = d * 0.66
    ctx.beginPath()
    ctx.arc(edge(spot), py(W / 2), Math.max(2, s * 0.25), 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    const a = Math.acos(Math.min(1, (d - spot) / mode.centerRadius))
    const start = dir === 1 ? -a : Math.PI - a
    const end = dir === 1 ? a : Math.PI + a
    ctx.arc(edge(spot), py(W / 2), mode.centerRadius * s, start, end)
    ctx.stroke()
  }

  if (heat) {
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(heat, ox, oy, L * s, W * s)
    ctx.restore()
  }
}

type Pt = { x: number; y: number }

// Las etiquetas se repiten fotograma a fotograma: se mide cada texto una sola vez.
const labelWidths = new Map<string, number>()

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let measured = labelWidths.get(text)
  if (measured === undefined) {
    measured = ctx.measureText(text).width
    if (labelWidths.size > 500) labelWidths.clear()
    labelWidths.set(text, measured)
  }
  const w = measured + 10
  ctx.fillStyle = 'rgba(0,0,0,0.68)'
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - 9, w, 18, 6)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(text, x, y + 1)
}

/** Envolvente convexa (cadena monótona). */
function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const build = (list: Pt[]) => {
    const hull: Pt[] = []
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop()
      hull.push(p)
    }
    hull.pop()
    return hull
  }
  return [...build(sorted), ...build([...sorted].reverse())]
}

const formatMeters = (m: number) => `${m.toFixed(1).replace('.', ',')} m`

/** Líneas tácticas con la distancia entre ellas, bloque del equipo y cobertura de cada jugador. */
function drawAnalysis(ctx: CanvasRenderingContext2D, v: SceneView, toPx: (pt: Pt) => Pt) {
  const { mode, positions, colors, analysis, groups, geo } = v
  for (const side of ['left', 'right'] as const) {
    const color = colors[side]
    const everyone = Object.keys(positions).filter((k) => k !== BALL && sideOf(k) === side)
    if (everyone.length === 0) continue
    const lines = groups[side].map((g) => g.filter((k) => k in positions)).filter((g) => g.length > 0)

    if (analysis.coverage) {
      const radius = mode.width * 0.14 * geo.s
      ctx.fillStyle = color
      ctx.globalAlpha = 0.1
      for (const key of everyone) {
        const c = toPx(positions[key])
        ctx.beginPath()
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    if (analysis.block) {
      const hull = convexHull(lines.flat().map((k) => toPx(positions[k])))
      if (hull.length >= 3) {
        ctx.beginPath()
        hull.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.closePath()
        ctx.globalAlpha = 0.16
        ctx.fillStyle = color
        ctx.fill()
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
    }

    if (analysis.lines) {
      const centers: Pt[] = []
      for (const keys of lines) {
        const pts = keys.map((k) => positions[k]).sort((a, b) => a.y - b.y)
        if (pts.length >= 2) {
          ctx.beginPath()
          pts.forEach((p, i) => {
            const c = toPx(p)
            if (i === 0) ctx.moveTo(c.x, c.y)
            else ctx.lineTo(c.x, c.y)
          })
          ctx.strokeStyle = color
          ctx.globalAlpha = 0.9
          ctx.lineWidth = 2.5
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        centers.push({
          x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
          y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
        })
      }
      // distancia en profundidad entre líneas consecutivas
      for (let i = 1; i < centers.length; i++) {
        const a = centers[i - 1]
        const b = centers[i]
        const mid = toPx({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
        drawLabel(ctx, formatMeters(Math.abs(b.x - a.x) * mode.length), mid.x, mid.y)
      }
    }
  }
}

/** Capa dinámica: dibujos, trayectorias y fichas. */
export function renderScene(ctx: CanvasRenderingContext2D, v: SceneView) {
  const { mode, geo, positions, colors, tokens, selected } = v
  const { ox, oy, s, r } = geo
  const toPx = (pt: { x: number; y: number }) => ({
    x: ox + pt.x * mode.length * s,
    y: oy + pt.y * mode.width * s,
  })
  const trace = (points: { x: number; y: number }[]) => {
    ctx.beginPath()
    points.forEach((pt, i) => {
      const c = toPx(pt)
      if (i === 0) ctx.moveTo(c.x, c.y)
      else ctx.lineTo(c.x, c.y)
    })
    ctx.stroke()
  }

  // zonas sombreadas (bajo las trayectorias)
  for (const a of v.annotations) {
    if (a.kind === 'zone') drawZone(ctx, a, toPx)
    else if (a.kind === 'ellipse') drawEllipse(ctx, a, toPx)
  }
  if (v.drawing?.kind === 'zone') drawZone(ctx, v.drawing, toPx)
  if (v.drawing?.kind === 'ellipse') drawEllipse(ctx, v.drawing, toPx)

  drawAnalysis(ctx, v, toPx)

  // trayectorias
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const m of v.trails) {
    const isBall = m.key === BALL
    const color = tokenColor(m.key, colors)
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 5
    trace(m.path)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.setLineDash(isBall ? [6, 6] : [])
    trace(m.path)
    // punta de flecha en el último tramo con longitud
    const end = toPx(m.path[m.path.length - 1])
    let prev: { x: number; y: number } | undefined
    for (let i = m.path.length - 2; i >= 0; i--) {
      const c = toPx(m.path[i])
      if (Math.hypot(c.x - end.x, c.y - end.y) > 4) {
        prev = c
        break
      }
    }
    if (prev) {
      const angle = Math.atan2(end.y - prev.y, end.x - prev.x)
      ctx.setLineDash([])
      ctx.fillStyle = color
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(end.x - 11 * Math.cos(angle - 0.45), end.y - 11 * Math.sin(angle - 0.45))
      ctx.lineTo(end.x - 11 * Math.cos(angle + 0.45), end.y - 11 * Math.sin(angle + 0.45))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }

  // movimiento seleccionado: resaltado y tiradores
  const sel = v.selectedMovement === null ? undefined : v.trails[v.selectedMovement]
  if (sel) {
    ctx.setLineDash([])
    ctx.strokeStyle = theme().primary
    ctx.lineWidth = 4
    trace(sel.path)
    if (v.handles) {
      sel.path.forEach((pt, i) => {
        const c = toPx(pt)
        const fixed = i === 0 || (i === sel.path.length - 1 && !v.endMovable)
        ctx.beginPath()
        ctx.arc(c.x, c.y, fixed ? 3 : HANDLE_R, 0, Math.PI * 2)
        ctx.fillStyle = fixed ? theme().primary : '#fff'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#a16207'
        ctx.stroke()
        if (i > 0) {
          // tirador intermedio: arrastrarlo crea un punto nuevo en ese tramo
          const m = toPx({
            x: (sel.path[i - 1].x + pt.x) / 2,
            y: (sel.path[i - 1].y + pt.y) / 2,
          })
          ctx.beginPath()
          ctx.arc(m.x, m.y, HANDLE_R * 0.6, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = theme().primary
          ctx.stroke()
        }
      })
    }
  }

  // metros y velocidad de cada recorrido
  if (v.measures) {
    for (const m of v.trails) {
      const stats = movementStats(m, mode)
      const mid = toPx(m.path[Math.floor(m.path.length / 2)])
      drawLabel(ctx, `${formatMeters(stats.distance)} · ${stats.speedKmh.toFixed(0)} km/h`, mid.x, mid.y - 14)
    }
  }

  // flechas, conos y textos
  for (const a of v.annotations) if (a.kind !== 'zone' && a.kind !== 'ellipse') drawMark(ctx, a, toPx)
  if (v.drawing && v.drawing.kind !== 'zone' && v.drawing.kind !== 'ellipse') drawMark(ctx, v.drawing, toPx)

  // trazo en bruto de los arrastres en curso
  if (v.drags.length) {
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(253,224,71,0.85)'
    ctx.lineWidth = 2
    for (const drag of v.drags) trace(drag.path)
  }
  ctx.setLineDash([])

  // otra jugada superpuesta, en tenue
  if (v.ghost) {
    ctx.setLineDash([7, 5])
    ctx.strokeStyle = 'rgba(245,158,11,0.9)'
    ctx.lineWidth = 2
    for (const m of v.ghost.trails) trace(m.path)
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 2
    for (const [key, p] of Object.entries(v.ghost.positions)) {
      const c = toPx(p)
      ctx.beginPath()
      ctx.arc(c.x, c.y, key === BALL ? r * 0.55 : r, 0, Math.PI * 2)
      ctx.globalAlpha = 0.35
      ctx.fillStyle = tokenColor(key, colors)
      ctx.fill()
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = '#f59e0b'
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.setLineDash([])
  }

  // fichas (el balón va encima)
  const dragging = new Set(v.drags.map((d) => d.key))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const keys = Object.keys(positions).sort((a, b) => Number(a === BALL) - Number(b === BALL))
  for (const key of keys) {
    const c = toPx(positions[key])
    const lifted = dragging.has(key)
    if (key === BALL) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, r * 0.55 * (lifted ? 1.2 : 1), 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = lifted ? theme().primary : '#111'
      ctx.stroke()
      continue
    }
    const token = tokens[key]
    const scale = token?.size ?? 1
    const tr = (lifted ? r * 1.15 : r) * scale
    if (key === v.carrier) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, tr + 4, 0, Math.PI * 2)
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = '#fff'
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (key === selected) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, tr + 5, 0, Math.PI * 2)
      ctx.lineWidth = 3
      ctx.strokeStyle = theme().primary
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(c.x, c.y, tr, 0, Math.PI * 2)
    ctx.fillStyle = tokenColor(key, colors)
    ctx.fill()
    ctx.lineWidth = lifted ? 3 : 2
    ctx.strokeStyle = lifted ? theme().primary : key.startsWith('ref-') ? theme().neutral : '#fff'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `700 ${Math.round(r * scale * 0.95)}px system-ui, sans-serif`
    ctx.fillText(token?.text ?? '', c.x, c.y + 1)
    if (token?.caption) {
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.strokeText(token.caption, c.x, c.y + tr + 11)
      ctx.fillStyle = '#fff'
      ctx.fillText(token.caption, c.x, c.y + tr + 11)
    }
  }
}

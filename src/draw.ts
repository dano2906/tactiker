import { drawEllipse, drawMark, drawZone, type Annotation } from './annotations'
import { computeControl } from './control'
import type { Mode, Side } from './modes'
import type { PassNetwork } from './passes'
import { theme } from './theme'
import { movementStats, type Movement, type PathPoint, type Positions } from './recording'

export interface TokenLabel {
  /** Texto dentro de la ficha (dorsal). */
  text: string
  /** Texto bajo la ficha (nombre o posición). */
  caption: string
  /** Tamaño relativo (1 = normal). */
  size?: number
  /** Foto (data URL) que sustituye al dorsal dentro de la ficha. */
  photo?: string
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
  /** Espacio controlado por cada equipo (diagrama de Voronoi). */
  control: boolean
}

export type ZoneMode = 'off' | 'lanes' | 'thirds' | 'grid'

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
  zones: ZoneMode
  /** Red de pases a dibujar (`null` = oculta). */
  network: PassNetwork | null
  /** Claves de ficha de cada línea de campo (sin portero) por equipo, de defensa a ataque. */
  groups: Record<Side, string[][]>
  annotations: Annotation[]
  /** Flecha o zona que se está dibujando. */
  drawing: Annotation | null
  drags: DragView[]
  /** Otra jugada superpuesta para comparar. */
  ghost: { positions: Positions; trails: Movement[] } | null
}

// Las fotos se decodifican una vez; al terminar de cargar, el terreno se vuelve a dibujar.
const photoCache = new Map<string, HTMLImageElement>()
let assetListener: (() => void) | null = null
export const setAssetListener = (listener: (() => void) | null) => {
  assetListener = listener
}
function photoImage(url: string): HTMLImageElement | null {
  let img = photoCache.get(url)
  if (!img) {
    img = new Image()
    img.onload = () => assetListener?.()
    img.src = url
    photoCache.set(url, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
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
export const padFor = (cw: number, ch: number) => Math.max(6, Math.min(24, Math.min(cw, ch) * 0.05))

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

/** Zona del terreno en coordenadas normalizadas (0..1). */
export interface Region {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Zoom y desplazamiento que encuadran una zona del terreno (medio campo, área…). */
export function fitView(mode: Mode, cw: number, ch: number, r: Region): View {
  const pad = padFor(cw, ch)
  const s0 = Math.min((cw - pad * 2) / mode.length, (ch - pad * 2) / mode.width)
  const ox0 = (cw - mode.length * s0) / 2
  const oy0 = (ch - mode.width * s0) / 2
  const rw = (r.x1 - r.x0) * mode.length * s0
  const rh = (r.y1 - r.y0) * mode.width * s0
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Math.min((cw - pad * 2) / rw, (ch - pad * 2) / rh)))
  const cx = ox0 + ((r.x0 + r.x1) / 2) * mode.length * s0
  const cy = oy0 + ((r.y0 + r.y1) / 2) * mode.width * s0
  return { zoom, panX: -(cx - cw / 2) * zoom, panY: -(cy - ch / 2) * zoom }
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
  /** Imagen de fondo: sustituye al césped (las líneas se dibujan encima). */
  background: HTMLImageElement | null = null,
) {
  const { ox, oy, s } = geo
  const { length: L, width: W } = mode
  const px = (m: number) => ox + m * s
  const py = (m: number) => oy + m * s

  const t = theme()
  ctx.fillStyle = t.background
  ctx.fillRect(0, 0, cw, ch)

  if (background) {
    // la imagen cubre el terreno (recortada, sin deformarse) y se oscurece un poco para que se vean las líneas
    const ratio = Math.max((L * s) / background.width, (W * s) / background.height)
    const dw = background.width * ratio
    const dh = background.height * ratio
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, oy, L * s, W * s)
    ctx.clip()
    ctx.drawImage(background, ox + (L * s - dw) / 2, oy + (W * s - dh) / 2, dw, dh)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
    ctx.fillRect(ox, oy, L * s, W * s)
    ctx.restore()
  } else {
    // césped con franjas
    ctx.fillStyle = t.pitch
    ctx.fillRect(ox, oy, L * s, W * s)
    const stripes = 12
    ctx.fillStyle = t.pitchStripe
    for (let i = 0; i < stripes; i += 2) {
      ctx.fillRect(px((L / stripes) * i), oy, (L / stripes) * s, W * s)
    }
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

const LANE_NAMES = ['Exterior', 'Interior', 'Central', 'Interior', 'Exterior']
const THIRD_NAMES = ['Tercio defensivo', 'Tercio medio', 'Tercio ofensivo']

/** Carriles (5 franjas a lo largo del campo), tercios (3 a lo ancho) o ambos; los nombres van desde la óptica del rojo. */
function drawZones(ctx: CanvasRenderingContext2D, v: SceneView, toPx: (pt: Pt) => Pt) {
  if (v.zones === 'off') return
  const lanes = v.zones === 'lanes' || v.zones === 'grid'
  const thirds = v.zones === 'thirds' || v.zones === 'grid'
  ctx.save()
  ctx.setLineDash([9, 6])
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1.5
  const line = (a: Pt, b: Pt) => {
    const p = toPx(a)
    const q = toPx(b)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
    ctx.stroke()
  }
  if (lanes) for (const y of [0.2, 0.4, 0.6, 0.8]) line({ x: 0, y }, { x: 1, y })
  if (thirds) for (const x of [1 / 3, 2 / 3]) line({ x, y: 0 }, { x, y: 1 })
  ctx.setLineDash([])
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 3
  const text = (label: string, at: Pt, align: CanvasTextAlign) => {
    const c = toPx(at)
    ctx.textAlign = align
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.strokeText(label, c.x, c.y)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.fillText(label, c.x, c.y)
  }
  if (lanes) LANE_NAMES.forEach((n, i) => text(n, { x: 0.012, y: (i + 0.5) / 5 }, 'left'))
  if (thirds) THIRD_NAMES.forEach((n, i) => text(n, { x: (i + 0.5) / 3, y: 0.025 }, 'center'))
  ctx.restore()
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

let controlCanvas: HTMLCanvasElement | null = null
let controlImage: ImageData | null = null
let controlPixels: Uint32Array | null = null
let controlOwner: Int8Array | null = null
let controlKey: { positions: Positions; mode: Mode; colors: Record<Side, string> } | null = null
let controlResult: ReturnType<typeof computeControl> | null = null

/** Un píxel RGBA como entero (el orden de bytes de un `Uint32Array` en procesadores little-endian). */
const packRgba = ([r, g, b]: [number, number, number], a: number) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0

/** Colorea cada celda del terreno con el color del equipo que llega antes a ella y muestra el reparto. */
function drawControl(ctx: CanvasRenderingContext2D, v: SceneView, toPx: (pt: Pt) => Pt) {
  // El reparto solo se recalcula si las posiciones, la modalidad o los colores han cambiado.
  const same =
    controlKey && controlKey.positions === v.positions && controlKey.mode === v.mode && controlKey.colors === v.colors
  if (!same || !controlResult || !controlCanvas || !controlImage || !controlPixels) {
    const control = computeControl(v.positions, v.mode, controlOwner ?? undefined)
    controlOwner = control.owner
    controlResult = control
    controlKey = { positions: v.positions, mode: v.mode, colors: v.colors }
    controlCanvas ??= document.createElement('canvas')
    if (!controlImage || controlImage.width !== control.cols || controlImage.height !== control.rows) {
      controlCanvas.width = control.cols
      controlCanvas.height = control.rows
      controlImage = controlCanvas.getContext('2d')!.createImageData(control.cols, control.rows)
      controlPixels = new Uint32Array(controlImage.data.buffer)
    }
    const packed = [packRgba(hexToRgb(v.colors.left), 88), packRgba(hexToRgb(v.colors.right), 88)]
    for (let i = 0; i < control.owner.length; i++) {
      const owner = control.owner[i]
      controlPixels![i] = owner < 0 ? 0 : packed[owner]
    }
    controlCanvas.getContext('2d')!.putImageData(controlImage, 0, 0)
  }
  const control = controlResult
  const topLeft = toPx({ x: 0, y: 0 })
  const bottomRight = toPx({ x: 1, y: 1 })
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(controlCanvas, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
  ctx.restore()
  const label = toPx({ x: 0.5, y: 0.94 })
  drawLabel(ctx, `Rojo ${Math.round(control.left * 100)} %  ·  Azul ${Math.round(control.right * 100)} %`, label.x, label.y)
}

/** Red de pases: flechas entre las posiciones medias de los jugadores, más gruesas cuanto más se pasan. */
function drawNetwork(ctx: CanvasRenderingContext2D, v: SceneView, toPx: (pt: Pt) => Pt) {
  const network = v.network
  if (!network || network.edges.length === 0) return
  const node = new Map(network.nodes.map((n) => [n.key, n]))
  const r = v.geo.r * 0.8
  ctx.save()
  ctx.lineCap = 'round'
  for (const edge of network.edges) {
    const a = node.get(edge.from)
    const b = node.get(edge.to)
    if (!a || !b) continue
    const p = toPx(a)
    const q = toPx(b)
    const dist = Math.hypot(q.x - p.x, q.y - p.y)
    if (dist < 1) continue
    const ux = (q.x - p.x) / dist
    const uy = (q.y - p.y) / dist
    const start = { x: p.x + ux * r, y: p.y + uy * r }
    const end = { x: q.x - ux * (r + 4), y: q.y - uy * (r + 4) }
    const color = tokenColor(edge.from, v.colors)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = Math.min(10, 2 + edge.count * 1.8) + 2
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = Math.min(10, 2 + edge.count * 1.8)
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    const head = 7 + Math.min(5, edge.count)
    const angle = Math.atan2(uy, ux)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(end.x + ux * 5, end.y + uy * 5)
    ctx.lineTo(end.x - head * Math.cos(angle - 0.5), end.y - head * Math.sin(angle - 0.5))
    ctx.lineTo(end.x - head * Math.cos(angle + 0.5), end.y - head * Math.sin(angle + 0.5))
    ctx.closePath()
    ctx.fill()
    if (edge.count > 1) drawLabel(ctx, `×${edge.count}`, (start.x + end.x) / 2, (start.y + end.y) / 2 - 10)
  }
  ctx.restore()
  for (const n of network.nodes) {
    const c = toPx(n)
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(11, 16, 21, 0.82)'
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = tokenColor(n.key, v.colors)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `700 ${Math.round(r)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(v.tokens[n.key]?.text ?? '', c.x, c.y + 1)
  }
}

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

/**
 * Balón clásico: esfera blanca con sombreado, pentágono negro en el centro, costuras hacia el borde y
 * medios pentágonos en el contorno. Se dibuja en el centro (x, y) con radio `r`.
 */
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lifted: boolean) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()

  // esfera: blanco con luz arriba a la izquierda y sombra abajo a la derecha
  const sphere = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  sphere.addColorStop(0, '#ffffff')
  sphere.addColorStop(0.65, '#eef1f3')
  sphere.addColorStop(1, '#b9c1c7')
  ctx.fillStyle = sphere
  ctx.fillRect(x - r, y - r, r * 2, r * 2)

  const pentagon = (cx: number, cy: number, radius: number, rotation: number) => {
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = rotation + (i * 2 * Math.PI) / 5
      const px = cx + radius * Math.cos(a)
      const py = cy + radius * Math.sin(a)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }

  const ink = '#161b20'
  const up = -Math.PI / 2
  ctx.fillStyle = ink
  pentagon(x, y, r * 0.33, up)
  ctx.fill()

  // costuras desde cada vértice del pentágono central y medios pentágonos en el borde
  ctx.strokeStyle = ink
  ctx.lineWidth = Math.max(0.9, r * 0.07)
  ctx.lineCap = 'round'
  for (let i = 0; i < 5; i++) {
    const a = up + (i * 2 * Math.PI) / 5
    ctx.beginPath()
    ctx.moveTo(x + r * 0.33 * Math.cos(a), y + r * 0.33 * Math.sin(a))
    ctx.lineTo(x + r * 0.62 * Math.cos(a), y + r * 0.62 * Math.sin(a))
    ctx.stroke()
    const b = a + Math.PI / 5
    pentagon(x + r * 1.0 * Math.cos(b), y + r * 1.0 * Math.sin(b), r * 0.3, b + Math.PI)
    ctx.fill()
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.lineWidth = lifted ? 2.5 : 1.5
  ctx.strokeStyle = lifted ? theme().primary : 'rgba(10, 14, 18, 0.9)'
  ctx.stroke()
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

  drawZones(ctx, v, toPx)
  if (v.analysis.control) drawControl(ctx, v, toPx)
  drawAnalysis(ctx, v, toPx)
  drawNetwork(ctx, v, toPx)

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
      drawBall(ctx, c.x, c.y, r * 0.62 * (lifted ? 1.2 : 1), lifted)
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
    const photo = token?.photo ? photoImage(token.photo) : null
    if (photo) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(c.x, c.y, tr - 1.5, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(photo, c.x - tr, c.y - tr, tr * 2, tr * 2)
      ctx.restore()
    } else {
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${Math.round(r * scale * 0.95)}px system-ui, sans-serif`
      ctx.fillText(token?.text ?? '', c.x, c.y + 1)
    }
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

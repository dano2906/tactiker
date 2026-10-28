import type { RefObject } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { hitAnnotation, type Annotation, type Tool } from './annotations'
import {
  BALL, DEFAULT_VIEW, setAssetListener, HANDLE_R, MAX_ZOOM, clampView, computeGeometry, fitView, renderPitchLayer, renderScene,
  type Analysis, type DragView, type Geometry, type Region, type TokenLabel, type View, type ZoneMode,
} from './draw'
import type { Mode, Side } from './modes'
import type { PassNetwork } from './passes'
import type { Movement, PathPoint, Point, Positions } from './recording'

export type { TokenLabel } from './draw'

/** Datos de una ficha que se muestran al pasar el ratón por encima. */
export interface TokenInfo {
  title: string
  lines: string[]
  photo?: string
}

/** Control directo del terreno, sin pasar por el estado (reproducción y zoom). */
export interface PitchApi {
  /** Dibuja estas posiciones (y las de la jugada superpuesta, si hay) en lugar de las del estado. */
  draw: (positions: Positions, ghost?: Positions | null) => void
  zoomBy: (factor: number) => void
  resetView: () => void
  /** Encuadra una zona del terreno (medio campo, área…). */
  fit: (region: Region) => void
}

interface Props {
  mode: Mode
  positions: Positions
  /** Solo se pueden arrastrar fichas mientras se graba. */
  editable: boolean
  colors: Record<Side, string>
  tokens: Record<string, TokenLabel>
  /** Trayectorias a dibujar (vacío para ocultarlas). */
  trails: Movement[]
  selected: string | null
  carrier: string | null
  /** Movimiento seleccionado (índice en `trails`); con tiradores para editar su recorrido. */
  selectedMovement: number | null
  endMovable: boolean
  onSelectMovement: (index: number | null) => void
  /** Se llama al soltar un tirador, con los puntos nuevos del recorrido. */
  onEditPath: (index: number, points: Point[]) => void
  measures: boolean
  analysis: Analysis
  zones: ZoneMode
  /** Red de pases (`null` = oculta). */
  network: PassNetwork | null
  /** Imagen de fondo en lugar del césped. */
  background: HTMLImageElement | null
  groups: Record<Side, string[][]>
  /** Mapa de calor ya calculado. */
  heat: HTMLCanvasElement | null
  /** Otra jugada superpuesta (trayectorias y posiciones en el instante actual). */
  ghost: { positions: Positions; trails: Movement[] } | null
  /** Referencia al canvas, para exportar imagen o vídeo. */
  canvasRef: RefObject<HTMLCanvasElement | null>
  apiRef: RefObject<PitchApi | null>
  tool: Tool
  annotations: Annotation[]
  annotationColor: string
  onAnnotate: (annotation: Annotation) => void
  onErase: (id: string) => void
  /** Se llama al soltar una ficha; durante el arrastre el estado no cambia. */
  onDrop: (key: string, path: PathPoint[]) => void
  /** ¿Se puede arrastrar esta ficha para colocarla (sin grabar)? */
  placeable: (key: string) => boolean
  onPlace: (key: string, x: number, y: number) => void
  /** Clic sobre una ficha (fuera de la grabación) o sobre el vacío (`null`). */
  onSelect: (key: string | null) => void
  onZoomChange: (zoom: number) => void
  /** Datos de la ficha para el cuadro que aparece al pasar el ratón por encima. */
  describe: (key: string) => TokenInfo | null
}

interface Drag {
  key: string
  startedAt: number
  path: PathPoint[]
}

interface PathEdit {
  pointerId: number
  index: number
  points: Point[]
  /** Punto que se está arrastrando. */
  pi: number
}

type TwoPoint = Extract<Annotation, { kind: 'arrow' | 'zone' | 'ellipse' }>
type Freehand = Extract<Annotation, { kind: 'free' }>

interface Drawing {
  pointerId: number
  annotation: TwoPoint | Freehand
}

interface Place {
  pointerId: number
  key: string
  startX: number
  startY: number
  moved: boolean
}

interface Pan {
  pointerId: number
  startX: number
  startY: number
  view: View
}

interface Pinch {
  /** Distancia entre los dos dedos, punto medio y vista al empezar. */
  distance: number
  midX: number
  midY: number
  view: View
}

const MAX_DPR = 2

// Identificador de cada mapa de calor o imagen de fondo, para saber si hay que redibujar la capa estática.
const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
const objectId = (value: object | null) => {
  if (!value) return 0
  if (!objectIds.has(value)) objectIds.set(value, nextObjectId++)
  return objectIds.get(value)!
}

function Pitch(props: Props) {
  const { mode, positions, editable, canvasRef, apiRef, tool, annotations } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  // Siempre apunta a las últimas props, para que el dibujado y los eventos no usen valores viejos.
  const latest = useRef(props)
  latest.current = props

  const geoRef = useRef<Geometry | null>(null)
  const viewRef = useRef<View>(DEFAULT_VIEW)
  const reportedZoom = useRef(1)
  /** Posiciones que se muestran en lugar de las del estado (arrastre o reproducción en curso). */
  const overrideRef = useRef<Positions | null>(null)
  const ghostOverrideRef = useRef<Positions | null>(null)
  const dragsRef = useRef(new Map<number, Drag>())
  const drawingRef = useRef<Drawing | null>(null)
  const editRef = useRef<PathEdit | null>(null)
  const placeRef = useRef<Place | null>(null)
  const panRef = useRef<Pan | null>(null)
  const pinchRef = useRef<Pinch | null>(null)
  /** Todos los punteros apoyados en el canvas (para detectar el pellizco). */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const layerRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)
  const frameRef = useRef(0)
  const tipRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<string | null>(null)

  const paint = () => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const p = latest.current
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    if (cw === 0 || ch === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const w = Math.round(cw * dpr)
    const h = Math.round(ch * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
    }
    const view = (viewRef.current = clampView(viewRef.current, p.mode, cw, ch))
    if (view.zoom !== reportedZoom.current) {
      reportedZoom.current = view.zoom
      p.onZoomChange(view.zoom)
    }
    const geo = computeGeometry(p.mode, cw, ch, view)
    geoRef.current = geo

    // Capa estática en caché: solo se vuelve a dibujar si cambia el tamaño, la modalidad o el encuadre.
    const key = `${p.mode.id}|${p.mode.length}|${p.mode.width}|${w}|${h}|${view.zoom.toFixed(3)}|${Math.round(view.panX)}|${Math.round(view.panY)}|${objectId(p.heat)}|${objectId(p.background)}`
    if (layerRef.current?.key !== key) {
      const layer = document.createElement('canvas')
      layer.width = w
      layer.height = h
      const lctx = layer.getContext('2d')!
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      renderPitchLayer(lctx, p.mode, geo, cw, ch, p.heat, p.background)
      layerRef.current = { key, canvas: layer }
    }

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(layerRef.current.canvas, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const edit = editRef.current
    const trails = edit
      ? p.trails.map((m, i) =>
          i === edit.index ? { ...m, path: edit.points.map((pt) => ({ ...pt, t: 0 })) } : m,
        )
      : p.trails
    renderScene(ctx, {
      mode: p.mode,
      geo,
      positions: overrideRef.current ?? p.positions,
      colors: p.colors,
      tokens: p.tokens,
      trails,
      selectedMovement: p.selectedMovement,
      handles: p.selectedMovement !== null,
      endMovable: p.endMovable,
      selected: p.selected,
      carrier: p.carrier,
      measures: p.measures,
      analysis: p.analysis,
      zones: p.zones,
      network: p.network,
      groups: p.groups,
      annotations: p.annotations,
      drawing: drawingRef.current?.annotation ?? null,
      drags: [...dragsRef.current.values()].map((d): DragView => ({ key: d.key, path: d.path })),
      ghost: p.ghost
        ? { positions: ghostOverrideRef.current ?? p.ghost.positions, trails: p.ghost.trails }
        : null,
    })
  }

  /** Agrupa varias peticiones de dibujado (p. ej. eventos de puntero) en un único fotograma. */
  const requestPaint = () => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      paint()
    })
  }

  const setView = (next: View) => {
    viewRef.current = next
    requestPaint()
  }

  /** Cambia el zoom manteniendo fijo el punto (`cx`, `cy`) del canvas. */
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const wrap = wrapRef.current!
    const v = viewRef.current
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * factor))
    const ux = (cx - wrap.clientWidth / 2 - v.panX) / v.zoom
    const uy = (cy - wrap.clientHeight / 2 - v.panY) / v.zoom
    setView({
      zoom,
      panX: cx - wrap.clientWidth / 2 - ux * zoom,
      panY: cy - wrap.clientHeight / 2 - uy * zoom,
    })
  }

  useEffect(() => {
    apiRef.current = {
      draw: (positions, ghost) => {
        overrideRef.current = positions
        ghostOverrideRef.current = ghost ?? null
        paint()
      },
      zoomBy: (factor) => {
        const wrap = wrapRef.current!
        zoomAt(factor, wrap.clientWidth / 2, wrap.clientHeight / 2)
      },
      resetView: () => setView(DEFAULT_VIEW),
      fit: (region) => {
        const wrap = wrapRef.current!
        setView(fitView(latest.current.mode, wrap.clientWidth, wrap.clientHeight, region))
      },
    }
    const observer = new ResizeObserver(paint)
    observer.observe(wrapRef.current!)
    setAssetListener(requestPaint)
    return () => {
      setAssetListener(null)
      observer.disconnect()
      cancelAnimationFrame(frameRef.current)
      apiRef.current = null
    }
  }, [])

  // Cuando el estado trae posiciones nuevas, dejan de mandar las temporales.
  useEffect(() => {
    overrideRef.current = null
    ghostOverrideRef.current = null
    requestPaint()
  }, [positions, props.ghost])

  useEffect(requestPaint, [
    mode, props.colors, props.tokens, props.trails, props.selected, props.carrier, props.selectedMovement, props.endMovable,
    props.measures, props.analysis, props.zones, props.network, props.groups, props.heat, props.background, annotations,
  ])

  const toNormalized = (e: PointerEvent) => {
    const geo = geoRef.current!
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      px: e.clientX - rect.left,
      py: e.clientY - rect.top,
      x: Math.min(1, Math.max(0, (e.clientX - rect.left - geo.ox) / (mode.length * geo.s))),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top - geo.oy) / (mode.width * geo.s))),
    }
  }

  /** Posición del puntero dentro del canvas, en píxeles. */
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** Ficha bajo el puntero (la más cercana respecto a su radio de captura). */
  const pick = (pt: { px: number; py: number }, touch: boolean): string | null => {
    const geo = geoRef.current!
    const grip = touch ? 1.5 : 1
    const current = overrideRef.current ?? positions
    let best: string | null = null
    let bestRatio = 1
    for (const [key, p] of Object.entries(current)) {
      const scale = key === BALL ? 1 : (latest.current.tokens[key]?.size ?? 1)
      const reach = (key === BALL ? geo.r * 0.9 : geo.r * 1.3 * scale) * grip
      const d = Math.hypot(
        geo.ox + p.x * mode.length * geo.s - pt.px,
        geo.oy + p.y * mode.width * geo.s - pt.py,
      )
      if (d / reach <= bestRatio) {
        best = key
        bestRatio = d / reach
      }
    }
    return best
  }

  const toPixels = (pt: { x: number; y: number }) => ({
    x: geoRef.current!.ox + pt.x * mode.length * geoRef.current!.s,
    y: geoRef.current!.oy + pt.y * mode.width * geoRef.current!.s,
  })

  const handleDraw = (e: PointerEvent, pt: ReturnType<typeof toNormalized>) => {
    const { annotationColor, onAnnotate, onErase } = latest.current
    const id = crypto.randomUUID()
    if (tool === 'erase') {
      const tol = e.pointerType === 'touch' ? 16 : 8
      const hit = [...annotations].reverse().find((a) => hitAnnotation(a, { x: pt.px, y: pt.py }, toPixels, tol))
      if (hit) onErase(hit.id)
    } else if (tool === 'cone') {
      onAnnotate({ id, kind: 'cone', x: pt.x, y: pt.y })
    } else if (tool === 'text') {
      const text = window.prompt('Texto:')?.trim()
      if (text) onAnnotate({ id, kind: 'text', x: pt.x, y: pt.y, text: text.slice(0, 60), color: annotationColor })
    } else if (tool === 'arrow' || tool === 'zone' || tool === 'ellipse') {
      ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
      drawingRef.current = {
        pointerId: e.pointerId,
        annotation: { id, kind: tool, color: annotationColor, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y },
      }
    } else if (tool === 'free' || tool === 'curve') {
      ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
      drawingRef.current = {
        pointerId: e.pointerId,
        annotation: {
          id, kind: 'free', color: annotationColor, arrow: tool === 'curve', points: [{ x: pt.x, y: pt.y }],
        },
      }
    }
  }

  /** Recorrido más cercano al puntero (índice en `trails`), si está a tiro. */
  const pickTrail = (pt: { px: number; py: number }, touch: boolean): number | null => {
    const tol = touch ? 14 : 8
    let best: number | null = null
    let bestDist = tol
    latest.current.trails.forEach((m, i) => {
      for (let k = 1; k < m.path.length; k++) {
        const a = toPixels(m.path[k - 1])
        const b = toPixels(m.path[k])
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len2 = dx * dx + dy * dy
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt.px - a.x) * dx + (pt.py - a.y) * dy) / len2))
        const d = Math.hypot(pt.px - (a.x + t * dx), pt.py - (a.y + t * dy))
        if (d <= bestDist) {
          best = i
          bestDist = d
        }
      }
    })
    return best
  }

  /** Empieza a arrastrar un tirador del movimiento seleccionado (punto existente o intermedio). */
  const startPathEdit = (e: PointerEvent, pt: { px: number; py: number }, touch: boolean): boolean => {
    const { selectedMovement, trails, endMovable } = latest.current
    const move = selectedMovement === null ? undefined : trails[selectedMovement]
    if (selectedMovement === null || !move) return false
    const reach = HANDLE_R + (touch ? 10 : 4)
    const near = (p: Point) => {
      const c = toPixels(p)
      return Math.hypot(c.x - pt.px, c.y - pt.py) <= reach
    }
    const points: Point[] = move.path.map((p) => ({ x: p.x, y: p.y }))
    let pi = -1
    for (let i = points.length - 1; i >= 1; i--) {
      if ((i < points.length - 1 || endMovable) && near(points[i])) {
        pi = i
        break
      }
    }
    if (pi === -1) {
      // un tirador intermedio crea un punto nuevo en ese tramo
      for (let i = 1; i < points.length; i++) {
        const mid = { x: (points[i - 1].x + points[i].x) / 2, y: (points[i - 1].y + points[i].y) / 2 }
        if (near(mid)) {
          points.splice(i, 0, mid)
          pi = i
          break
        }
      }
    }
    if (pi === -1) return false
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
    editRef.current = { pointerId: e.pointerId, index: selectedMovement, points, pi }
    requestPaint()
    return true
  }

  /** ¿Hay algún gesto con un solo dedo en marcha (arrastre de ficha, dibujo, edición…)? */
  const busyGesture = () =>
    dragsRef.current.size > 0 || drawingRef.current !== null || editRef.current !== null || placeRef.current !== null

  const startPan = (e: PointerEvent) => {
    if (viewRef.current.zoom <= 1) return
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
    const p = localPoint(e)
    panRef.current = { pointerId: e.pointerId, startX: p.x, startY: p.y, view: viewRef.current }
  }

  const handleDown = (e: PointerEvent) => {
    hideHover()
    if (!geoRef.current) return
    pointersRef.current.set(e.pointerId, localPoint(e))
    // Dos dedos sobre el terreno vacío: pellizco para hacer zoom y mover.
    if (pointersRef.current.size === 2 && !busyGesture()) {
      const [a, b] = [...pointersRef.current.values()]
      panRef.current = null
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        view: viewRef.current,
      }
      return
    }
    const pt = toNormalized(e)
    if (tool !== 'select') {
      handleDraw(e, pt)
      return
    }
    const touch = e.pointerType === 'touch'
    const key = pick(pt, touch)
    if (!editable) {
      if (startPathEdit(e, pt, touch)) return
      if (key && latest.current.placeable(key)) {
        ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
        placeRef.current = { pointerId: e.pointerId, key, startX: e.clientX, startY: e.clientY, moved: false }
        return
      }
      if (key && key !== BALL) {
        latest.current.onSelect(key)
        return
      }
      const trail = pickTrail(pt, touch)
      if (trail !== null) {
        latest.current.onSelectMovement(trail)
        return
      }
      latest.current.onSelect(null)
      latest.current.onSelectMovement(null)
      startPan(e)
      return
    }
    const busy = [...dragsRef.current.values()].some((d) => d.key === key)
    if (!key) {
      startPan(e)
      return
    }
    if (busy) return
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
    const current = overrideRef.current ?? positions
    const from = current[key]
    dragsRef.current.set(e.pointerId, {
      key,
      startedAt: performance.now(),
      path: [
        { x: from.x, y: from.y, t: 0 },
        { x: pt.x, y: pt.y, t: 0 },
      ],
    })
    overrideRef.current = { ...current, [key]: { x: pt.x, y: pt.y } }
    requestPaint()
  }

  /** Muestra u oculta el cuadro de datos de la ficha bajo el puntero (solo ratón o lápiz, sin pulsar). */
  const updateHover = (e: PointerEvent) => {
    const tip = tipRef.current
    if (!tip || !geoRef.current) return
    const key = e.pointerType === 'touch' || e.buttons !== 0 ? null : pick(toNormalized(e), false)
    if (key !== hoverRef.current) {
      hoverRef.current = key
      const info = key ? latest.current.describe(key) : null
      if (!info) {
        tip.hidden = true
        hoverRef.current = null
        return
      }
      const title = document.createElement('strong')
      title.textContent = info.title
      const lines = info.lines.map((text) => {
        const line = document.createElement('span')
        line.textContent = text
        return line
      })
      if (info.photo) {
        const photo = document.createElement('img')
        photo.className = 'tip-photo'
        photo.alt = ''
        photo.src = info.photo
        tip.replaceChildren(photo, title, ...lines)
      } else {
        tip.replaceChildren(title, ...lines)
      }
      tip.hidden = false
    }
    if (!key) return
    const wrap = wrapRef.current!
    const at = localPoint(e)
    let left = at.x + 16
    let top = at.y + 16
    if (left + tip.offsetWidth > wrap.clientWidth - 4) left = at.x - tip.offsetWidth - 12
    if (top + tip.offsetHeight > wrap.clientHeight - 4) top = at.y - tip.offsetHeight - 12
    tip.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, top)}px)`
  }

  const hideHover = () => {
    hoverRef.current = null
    if (tipRef.current) tipRef.current.hidden = true
  }

  const handleMove = (e: PointerEvent) => {
    updateHover(e)
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, localPoint(e))
    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const wrap = wrapRef.current!
      const zoom = Math.min(MAX_ZOOM, Math.max(1, pinch.view.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance)))
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const ux = (pinch.midX - wrap.clientWidth / 2 - pinch.view.panX) / pinch.view.zoom
      const uy = (pinch.midY - wrap.clientHeight / 2 - pinch.view.panY) / pinch.view.zoom
      setView({
        zoom,
        panX: midX - wrap.clientWidth / 2 - ux * zoom,
        panY: midY - wrap.clientHeight / 2 - uy * zoom,
      })
      return
    }
    const pan = panRef.current
    if (pan?.pointerId === e.pointerId) {
      const p = localPoint(e)
      setView({ ...pan.view, panX: pan.view.panX + p.x - pan.startX, panY: pan.view.panY + p.y - pan.startY })
      return
    }
    const place = placeRef.current
    if (place?.pointerId === e.pointerId) {
      if (!place.moved && Math.hypot(e.clientX - place.startX, e.clientY - place.startY) < 4) return
      place.moved = true
      const pt = toNormalized(e)
      overrideRef.current = { ...(overrideRef.current ?? positions), [place.key]: { x: pt.x, y: pt.y } }
      requestPaint()
      return
    }
    const edit = editRef.current
    if (edit?.pointerId === e.pointerId) {
      const pt = toNormalized(e)
      edit.points[edit.pi] = { x: pt.x, y: pt.y }
      requestPaint()
      return
    }
    const drawing = drawingRef.current
    if (drawing?.pointerId === e.pointerId) {
      const pt = toNormalized(e)
      const a = drawing.annotation
      if (a.kind === 'free') {
        const last = toPixels(a.points[a.points.length - 1])
        const here = toPixels(pt)
        if (Math.hypot(here.x - last.x, here.y - last.y) >= 3) a.points.push({ x: pt.x, y: pt.y })
      } else {
        a.x2 = pt.x
        a.y2 = pt.y
      }
      requestPaint()
      return
    }
    const drag = dragsRef.current.get(e.pointerId)
    if (!drag) return
    const pt = toNormalized(e)
    drag.path.push({ x: pt.x, y: pt.y, t: performance.now() - drag.startedAt })
    overrideRef.current = { ...(overrideRef.current ?? positions), [drag.key]: { x: pt.x, y: pt.y } }
    requestPaint()
  }

  const handleUp = (e: PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) pinchRef.current = null
      return
    }
    if (panRef.current?.pointerId === e.pointerId) {
      panRef.current = null
      return
    }
    const place = placeRef.current
    if (place?.pointerId === e.pointerId) {
      placeRef.current = null
      if (place.moved) {
        const pt = toNormalized(e)
        latest.current.onPlace(place.key, pt.x, pt.y)
      } else if (place.key === BALL) {
        latest.current.onSelect(null)
        latest.current.onSelectMovement(null)
      } else {
        latest.current.onSelect(place.key)
      }
      requestPaint()
      return
    }
    const edit = editRef.current
    if (edit?.pointerId === e.pointerId) {
      editRef.current = null
      latest.current.onEditPath(edit.index, edit.points)
      requestPaint()
      return
    }
    const drawing = drawingRef.current
    if (drawing?.pointerId === e.pointerId) {
      drawingRef.current = null
      const a = drawing.annotation
      const meters =
        a.kind === 'free'
          ? a.points.reduce(
              (sum, p, i) =>
                i === 0 ? 0 : sum + Math.hypot((p.x - a.points[i - 1].x) * mode.length, (p.y - a.points[i - 1].y) * mode.width),
              0,
            )
          : Math.hypot((a.x2 - a.x1) * mode.length, (a.y2 - a.y1) * mode.width)
      if (meters > 1) latest.current.onAnnotate(a.kind === 'free' ? { ...a, points: [...a.points] } : { ...a })
      requestPaint()
      return
    }
    const drag = dragsRef.current.get(e.pointerId)
    if (!drag) return
    dragsRef.current.delete(e.pointerId)
    latest.current.onDrop(drag.key, drag.path)
    requestPaint()
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const p = localPoint(e)
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
  }

  return (
    <div ref={wrapRef} className="pitch-wrap">
      <canvas
        ref={canvasRef}
        className={tool !== 'select' ? 'drawing' : editable ? 'editable' : ''}
        aria-label={`Terreno de ${mode.label}`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={hideHover}
        onWheel={handleWheel}
      />
      <div ref={tipRef} className="token-tip glass" role="tooltip" hidden />
    </div>
  )
}

export default Pitch

export type Tool = 'select' | 'arrow' | 'free' | 'curve' | 'zone' | 'ellipse' | 'cone' | 'text' | 'erase'

/** Dibujos estáticos sobre el terreno, en coordenadas normalizadas (0..1). */
export type Annotation =
  | { id: string; kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; kind: 'zone'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; kind: 'ellipse'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; kind: 'free'; points: { x: number; y: number }[]; arrow: boolean; color: string }
  | { id: string; kind: 'cone'; x: number; y: number }
  | { id: string; kind: 'text'; x: number; y: number; text: string; color: string }

/** Color con el que se empieza a dibujar: el primario del tema (mismo valor que `--primary`). */
export const DEFAULT_ANNOTATION_COLOR = '#f4c20d'
export const CONE_COLOR = '#f97316'

type Px = { x: number; y: number }
type ToPx = (pt: Px) => Px

export function drawZone(ctx: CanvasRenderingContext2D, a: Extract<Annotation, { kind: 'zone' }>, toPx: ToPx) {
  const p = toPx({ x: a.x1, y: a.y1 })
  const q = toPx({ x: a.x2, y: a.y2 })
  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.fillStyle = a.color
  ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y))
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = a.color
  ctx.lineWidth = 2
  ctx.setLineDash([8, 5])
  ctx.strokeRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y))
  ctx.restore()
}

export function drawEllipse(ctx: CanvasRenderingContext2D, a: Extract<Annotation, { kind: 'ellipse' }>, toPx: ToPx) {
  const p = toPx({ x: a.x1, y: a.y1 })
  const q = toPx({ x: a.x2, y: a.y2 })
  const rx = Math.abs(q.x - p.x) / 2
  const ry = Math.abs(q.y - p.y) / 2
  if (rx < 1 || ry < 1) return
  ctx.save()
  ctx.beginPath()
  ctx.ellipse((p.x + q.x) / 2, (p.y + q.y) / 2, rx, ry, 0, 0, Math.PI * 2)
  ctx.globalAlpha = 0.18
  ctx.fillStyle = a.color
  ctx.fill()
  ctx.globalAlpha = 0.95
  ctx.strokeStyle = a.color
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()
}

/** Flechas, trazos libres, conos y textos (las zonas se dibujan aparte, bajo las trayectorias). */
export function drawMark(ctx: CanvasRenderingContext2D, a: Annotation, toPx: ToPx) {
  ctx.save()
  ctx.lineCap = 'round'
  if (a.kind === 'arrow') {
    const p = toPx({ x: a.x1, y: a.y1 })
    const q = toPx({ x: a.x2, y: a.y2 })
    const angle = Math.atan2(q.y - p.y, q.x - p.x)
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x - 6 * Math.cos(angle), q.y - 6 * Math.sin(angle))
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(q.x, q.y)
    ctx.lineTo(q.x - 14 * Math.cos(angle - 0.4), q.y - 14 * Math.sin(angle - 0.4))
    ctx.lineTo(q.x - 14 * Math.cos(angle + 0.4), q.y - 14 * Math.sin(angle + 0.4))
    ctx.closePath()
    ctx.fill()
  } else if (a.kind === 'free') {
    const pts = a.points.map(toPx)
    if (pts.length < 2) {
      ctx.restore()
      return
    }
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    // curva suave: cuadráticas entre los puntos medios de cada tramo
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
    if (a.arrow) {
      // la punta sigue la dirección del último tramo apreciable
      let from = pts[pts.length - 2]
      for (let i = pts.length - 2; i >= 0; i--) {
        from = pts[i]
        if (Math.hypot(last.x - from.x, last.y - from.y) > 8) break
      }
      const angle = Math.atan2(last.y - from.y, last.x - from.x)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(last.x - 14 * Math.cos(angle - 0.4), last.y - 14 * Math.sin(angle - 0.4))
      ctx.lineTo(last.x - 14 * Math.cos(angle + 0.4), last.y - 14 * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fill()
    }
  } else if (a.kind === 'cone') {
    const c = toPx(a)
    ctx.fillStyle = CONE_COLOR
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(c.x, c.y - 10)
    ctx.lineTo(c.x + 8, c.y + 7)
    ctx.lineTo(c.x - 8, c.y + 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (a.kind === 'text') {
    const c = toPx(a)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 16px system-ui, sans-serif'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'
    ctx.strokeText(a.text, c.x, c.y)
    ctx.fillStyle = a.color
    ctx.fillText(a.text, c.x, c.y)
  }
  ctx.restore()
}

function distanceToSegment(p: Px, a: Px, b: Px) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy))
}

/** ¿El punto (en píxeles) cae sobre la anotación? `tol` es la tolerancia en píxeles. */
export function hitAnnotation(a: Annotation, pt: Px, toPx: ToPx, tol: number): boolean {
  switch (a.kind) {
    case 'arrow':
      return distanceToSegment(pt, toPx({ x: a.x1, y: a.y1 }), toPx({ x: a.x2, y: a.y2 })) <= tol
    case 'free': {
      const pts = a.points.map(toPx)
      for (let i = 1; i < pts.length; i++) if (distanceToSegment(pt, pts[i - 1], pts[i]) <= tol) return true
      return false
    }
    case 'ellipse': {
      const p = toPx({ x: a.x1, y: a.y1 })
      const q = toPx({ x: a.x2, y: a.y2 })
      const rx = Math.abs(q.x - p.x) / 2 + tol
      const ry = Math.abs(q.y - p.y) / 2 + tol
      const dx = (pt.x - (p.x + q.x) / 2) / rx
      const dy = (pt.y - (p.y + q.y) / 2) / ry
      return dx * dx + dy * dy <= 1
    }
    case 'zone': {
      const p = toPx({ x: a.x1, y: a.y1 })
      const q = toPx({ x: a.x2, y: a.y2 })
      return (
        pt.x >= Math.min(p.x, q.x) - tol && pt.x <= Math.max(p.x, q.x) + tol &&
        pt.y >= Math.min(p.y, q.y) - tol && pt.y <= Math.max(p.y, q.y) + tol
      )
    }
    case 'cone': {
      const c = toPx(a)
      return Math.hypot(pt.x - c.x, pt.y - c.y) <= tol + 8
    }
    case 'text': {
      const c = toPx(a)
      const halfWidth = a.text.length * 4.5 + tol / 2
      return Math.abs(pt.x - c.x) <= halfWidth && Math.abs(pt.y - c.y) <= 10 + tol / 2
    }
  }
}

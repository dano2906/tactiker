import { positionsAt, totalDuration, type Movement, type Positions } from './recording'

export type HeatTarget = 'off' | 'left' | 'right' | 'ball' | 'selected'

const COLS = 64
const ROWS = 42
/** Radio del suavizado, en celdas. */
const SPREAD = 2.4
const SAMPLE_MS = 80
const MAX_SAMPLES = 700

/** Azul → cian → verde → amarillo → rojo; la opacidad crece con la intensidad. */
function colorAt(t: number): [number, number, number, number] {
  const stops: [number, number, number][] = [
    [30, 64, 255], [0, 200, 255], [0, 220, 90], [250, 230, 0], [255, 40, 20],
  ]
  const f = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(f))
  const k = f - i
  const [a, b] = [stops[i], stops[i + 1]]
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
    Math.round(255 * Math.min(0.85, 0.15 + t * 0.7)),
  ]
}

/**
 * Mapa de calor real: dónde pasan las fichas elegidas a lo largo de toda la jugada.
 * Se muestrea el recorrido cada pocos milisegundos y cada posición se reparte en las celdas vecinas.
 */
export function buildHeatmap(
  start: Positions,
  movements: Movement[],
  include: (key: string) => boolean,
): HTMLCanvasElement | null {
  const total = totalDuration(movements)
  const step = Math.max(SAMPLE_MS, total / MAX_SAMPLES)
  const grid = new Float32Array(COLS * ROWS)
  const reach = Math.ceil(SPREAD * 2)

  const splat = (x: number, y: number) => {
    const cx = x * COLS - 0.5
    const cy = y * ROWS - 0.5
    for (let j = Math.max(0, Math.floor(cy) - reach); j <= Math.min(ROWS - 1, Math.ceil(cy) + reach); j++) {
      for (let i = Math.max(0, Math.floor(cx) - reach); i <= Math.min(COLS - 1, Math.ceil(cx) + reach); i++) {
        const d2 = (i - cx) ** 2 + (j - cy) ** 2
        grid[j * COLS + i] += Math.exp(-d2 / (2 * SPREAD * SPREAD))
      }
    }
  }

  let any = false
  for (let t = 0; t <= total + step; t += step) {
    const positions = positionsAt(start, movements, Math.min(t, total))
    for (const [key, p] of Object.entries(positions)) {
      if (!include(key)) continue
      splat(p.x, p.y)
      any = true
    }
    if (t >= total) break
  }
  if (!any) return null

  let max = 0
  for (const v of grid) if (v > max) max = v
  const canvas = document.createElement('canvas')
  canvas.width = COLS
  canvas.height = ROWS
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(COLS, ROWS)
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i] / max
    if (t < 0.04) continue
    const [r, g, b, a] = colorAt(t)
    image.data.set([r, g, b, a], i * 4)
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

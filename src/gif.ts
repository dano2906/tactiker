export interface GifOptions {
  /** Canvas del terreno, de donde se copia cada fotograma. */
  source: HTMLCanvasElement
  /** Duración de la animación (ms). */
  duration: number
  /** Dibuja el terreno en el instante `t` (ms); debe pintar de forma síncrona. */
  drawAt: (t: number) => void
  onProgress: (fraction: number) => void
}

const MAX_WIDTH = 640
const FPS = 12
const MAX_FRAMES = 240
/** Pausa al principio y al final para que se vea la posición inicial y final. */
const HOLD_START = 500
const HOLD_END = 1200

/** Cede el hilo para que la interfaz pueda actualizar el progreso. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Genera un GIF animado de la jugada. No graba en tiempo real: calcula cada fotograma en su instante
 * exacto, así que el resultado no depende de lo rápido que vaya el equipo.
 */
export async function encodeGif({ source, duration, drawAt, onProgress }: GifOptions): Promise<Blob> {
  // El codificador solo se descarga cuando se pide un GIF.
  const { GIFEncoder, applyPalette, quantize } = await import('gifenc')
  const width = Math.min(MAX_WIDTH, source.width)
  const height = Math.max(1, Math.round((source.height / source.width) * width))
  const small = document.createElement('canvas')
  small.width = width
  small.height = height
  const ctx = small.getContext('2d', { willReadFrequently: true })!

  const frameMs = Math.max(1000 / FPS, duration / MAX_FRAMES)
  const frames = Math.max(1, Math.ceil(duration / frameMs) + 1)
  const gif = GIFEncoder()

  for (let i = 0; i < frames; i++) {
    drawAt(Math.min(duration, i * frameMs))
    ctx.drawImage(source, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    const palette = quantize(data, 256)
    const delay = frameMs + (i === 0 ? HOLD_START : 0) + (i === frames - 1 ? HOLD_END : 0)
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay })
    onProgress((i + 1) / frames)
    if (i % 3 === 2) await yieldToUi()
  }
  gif.finish()
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' })
}

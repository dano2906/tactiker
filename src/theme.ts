/**
 * Valores de diseño que usa el canvas, leídos de las variables CSS (`src/index.css`): así el terreno, las
 * fichas y la interfaz comparten una única fuente de colores en escritorio y en móvil.
 */
export interface Theme {
  background: string
  primary: string
  pitch: string
  pitchStripe: string
  pitchLine: string
  red: string
  blue: string
  neutral: string
  referee: string
}

let cached: Theme | null = null

export function theme(): Theme {
  if (cached) return cached
  const css = getComputedStyle(document.documentElement)
  const read = (name: string) => css.getPropertyValue(name).trim()
  cached = {
    background: read('--background'),
    primary: read('--primary'),
    pitch: read('--pitch'),
    pitchStripe: read('--pitch-stripe'),
    pitchLine: read('--pitch-line'),
    red: read('--team-red'),
    blue: read('--team-blue'),
    neutral: read('--neutral'),
    referee: read('--referee'),
  }
  return cached
}

import { createContext, type ComponentChildren } from 'preact'
import { useContext, useRef, useState, useEffect } from 'preact/hooks'
import './ColorPicker.css'
import { useLazyModule } from './lazy'

/*
 * Selector de color componible, con la misma API que el «Color Picker» de beUI (ColorPicker, Trigger, Content,
 * Area, Hue, Alpha, HexInput, Channels, Swatch, EyeDropper, Presets, Preset), pero sin React, Tailwind ni
 * `motion`: usa el atributo nativo `popover`, la API nativa `EyeDropper` y CSS para las transiciones.
 * El valor es un hex en minúsculas (#rrggbb, o #rrggbbaa si hay transparencia).
 */

// ---------- color ----------

export interface Hsva { h: number; s: number; v: number; a: number }
export interface Rgba { r: number; g: number; b: number; a: number }

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))

export function parseHex(text: string): Rgba | null {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim())
  if (!m) return null
  let h = m[1]
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
}

export function formatHex({ r, g, b, a }: Rgba): string {
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}${a < 1 ? hex(a * 255) : ''}`
}

export function hsvaToRgba({ h, s, v, a }: Hsva): Rgba {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255
  }
  return { r: f(5), g: f(3), b: f(1), a }
}

export function rgbaToHsva({ r, g, b, a }: Rgba, hueHint = 0): Hsva {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const d = max - Math.min(R, G, B)
  let h = hueHint
  if (d !== 0) {
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a }
}

export function rgbaToHsl({ r, g, b }: Rgba) {
  const { h, s: sv, v } = rgbaToHsva({ r, g, b, a: 1 })
  const l = v * (1 - sv / 2)
  return { h, s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l }
}

export function hslToRgba(h: number, s: number, l: number, a: number): Rgba {
  const v = l + s * Math.min(l, 1 - l)
  return hsvaToRgba({ h, s: v === 0 ? 0 : 2 * (1 - l / v), v, a })
}

export const toHex = (hsva: Hsva) => formatHex(hsvaToRgba(hsva))

// ---------- contexto ----------

export interface Ctx {
  hsva: Hsva
  hex: string
  alpha: boolean
  open: boolean
  setOpen: (open: boolean) => void
  update: (patch: Partial<Hsva>, commit?: boolean) => void
  setHex: (hex: string, commit?: boolean) => boolean
  commit: () => void
  label: string
  triggerRef: { current: HTMLButtonElement | null }
  contentRef: { current: HTMLDivElement | null }
}

export const PickerContext = createContext<Ctx | null>(null)
export const usePicker = () => {
  const ctx = useContext(PickerContext)
  if (!ctx) throw new Error('Los componentes ColorPicker* van dentro de <ColorPicker>')
  return ctx
}

interface PickerProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Se llama al terminar una interacción: soltar el puntero, tecla, preajuste o campo confirmado. */
  onValueCommit?: (value: string) => void
  /** Permite transparencia. Con `false` el valor siempre es opaco. */
  alpha?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  'aria-label'?: string
  className?: string
  children?: ComponentChildren
}

export function ColorPicker({
  value, defaultValue = '#3478f6', onValueChange, onValueCommit, alpha = true,
  open: openProp, defaultOpen = false, onOpenChange, className, children, ...rest
}: PickerProps) {
  const fromText = (text: string): Hsva => {
    const rgba = parseHex(text) ?? parseHex(defaultValue)!
    return rgbaToHsva(alpha ? rgba : { ...rgba, a: 1 })
  }
  const [hsva, setHsva] = useState<Hsva>(() => fromText(value ?? defaultValue))
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const latest = useRef(hsva)
  latest.current = hsva

  // Valor controlado: si cambia desde fuera (y no es el que ya tenemos), se adopta conservando el tono.
  useEffect(() => {
    if (value === undefined) return
    const parsed = parseHex(value)
    if (!parsed) return
    const current = latest.current
    if (formatHex(alpha ? parsed : { ...parsed, a: 1 }) === toHex(current)) return
    setHsva(rgbaToHsva(alpha ? parsed : { ...parsed, a: 1 }, current.h))
  }, [value, alpha])

  const update = (patch: Partial<Hsva>, commit = false) => {
    const next = { ...latest.current, ...patch, a: alpha ? (patch.a ?? latest.current.a) : 1 }
    latest.current = next
    setHsva(next)
    onValueChange?.(toHex(next))
    if (commit) onValueCommit?.(toHex(next))
  }

  const setHex = (text: string, commit = true) => {
    const rgba = parseHex(text)
    if (!rgba) return false
    update(rgbaToHsva(alpha ? rgba : { ...rgba, a: 1 }, latest.current.h), commit)
    return true
  }

  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }

  const ctx: Ctx = {
    hsva, hex: toHex(hsva), alpha, open, setOpen, update, setHex,
    commit: () => onValueCommit?.(toHex(latest.current)),
    label: rest['aria-label'] ?? 'Color',
    triggerRef, contentRef,
  }
  return (
    <PickerContext.Provider value={ctx}>
      <div className={`cp${className ? ` ${className}` : ''}`}>{children}</div>
    </PickerContext.Provider>
  )
}

// ---------- ventana emergente ----------

export function ColorPickerTrigger({ children, className }: { children?: ComponentChildren; className?: string }) {
  const { hex, open, setOpen, triggerRef, label } = usePicker()
  return (
    <button
      ref={triggerRef}
      type="button"
      className={`cp-trigger${className ? ` ${className}` : ''}`}
      aria-label={`${label}: ${hex}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span className="cp-chip" style={{ '--cp-color': hex }} />
      {children !== undefined ? children : <span className="cp-trigger-label">{hex}</span>}
    </button>
  )
}

// ---------- conjunto listo para usar ----------

interface FieldProps {
  value: string
  onValueChange: (value: string) => void
  label: string
  alpha?: boolean
  presets?: { value: string; label: string }[]
  /** Muestra solo la muestra de color, sin el valor hex junto a ella. */
  compact?: boolean
  align?: 'start' | 'end'
}

const loadParts = () => import('./ColorPickerParts')
export { loadParts as loadColorPickerParts }

/**
 * Selector completo: muestra que abre el panel con área, tono, opacidad, formatos, cuentagotas y preajustes.
 * El panel (la parte pesada) se descarga la primera vez que se abre, o poco después de arrancar la app.
 */
export function ColorField({ value, onValueChange, label, alpha = true, presets, compact = true, align = 'start' }: FieldProps) {
  const [open, setOpen] = useState(false)
  const parts = useLazyModule(loadParts, open)
  return (
    <ColorPicker aria-label={label} value={value} onValueChange={onValueChange} alpha={alpha} open={open} onOpenChange={setOpen}>
      <ColorPickerTrigger className={compact ? 'is-compact' : ''}>{compact ? null : undefined}</ColorPickerTrigger>
      {parts && <parts.ColorFieldPanel label={label} align={align} presets={presets} />}
    </ColorPicker>
  )
}

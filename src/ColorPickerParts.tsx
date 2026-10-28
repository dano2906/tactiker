import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import {
  clamp, formatHex, hslToRgba, hsvaToRgba, parseHex, rgbaToHsl, rgbaToHsva, usePicker,
  type Hsva, type Rgba,
} from './ColorPicker'
import Icon from './Icon'

/*
 * Partes del selector de color que solo se necesitan al abrir el panel (área, deslizadores, campos,
 * cuentagotas y preajustes). Están aparte para que no engorden la descarga inicial.
 */

// ---------- ventana emergente ----------

export function ColorPickerContent({
  children, align = 'start', className, ...rest
}: { children?: ComponentChildren; align?: 'start' | 'end'; className?: string; 'aria-label'?: string }) {
  const { open, setOpen, triggerRef, contentRef, label } = usePicker()

  useEffect(() => {
    const el = contentRef.current
    const trigger = triggerRef.current
    if (!el || !trigger) return
    if (!open) {
      if (el.matches(':popover-open')) el.hidePopover()
      return
    }
    el.showPopover()
    // Se coloca bajo el disparador (o encima si no cabe) y dentro de la pantalla.
    const rect = trigger.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = clamp(align === 'end' ? rect.right - w : rect.left, 8, Math.max(8, innerWidth - w - 8) || 8)
    const below = rect.bottom + 8
    const top = below + h <= innerHeight - 8 ? below : rect.top - h - 8 >= 8 ? rect.top - h - 8 : clamp(below, 8, Math.max(8, innerHeight - h - 8))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.focus({ preventScroll: true })

    const close = (e: Event) => {
      const target = e.target as Node
      if (el.contains(target) || trigger.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      trigger.focus()
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div
      ref={contentRef}
      popover="manual"
      role="dialog"
      tabIndex={-1}
      aria-label={rest['aria-label'] ?? label}
      className={`cp-content${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}

// ---------- deslizadores ----------

/** Arrastre con puntero sobre un elemento; devuelve la posición relativa (0..1) en cada eje. */
function useDrag(onMove: (x: number, y: number) => void, onEnd: () => void) {
  const [dragging, setDragging] = useState(false)
  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      setDragging(true)
      const rect = el.getBoundingClientRect()
      onMove(clamp((e.clientX - rect.left) / rect.width), clamp((e.clientY - rect.top) / rect.height))
      el.focus({ preventScroll: true })
      e.preventDefault()
    },
    onPointerMove: (e: PointerEvent) => {
      if (!dragging) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      onMove(clamp((e.clientX - rect.left) / rect.width), clamp((e.clientY - rect.top) / rect.height))
    },
    onPointerUp: () => {
      if (!dragging) return
      setDragging(false)
      onEnd()
    },
    onPointerCancel: () => {
      setDragging(false)
      onEnd()
    },
  }
  return { dragging, handlers }
}

export function ColorPickerArea({ label = 'Saturación y brillo', className }: { label?: string; className?: string }) {
  const { hsva, update, commit } = usePicker()
  const { dragging, handlers } = useDrag((x, y) => update({ s: x, v: 1 - y }), commit)
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01
    const move: Partial<Hsva> | null =
      e.key === 'ArrowLeft' ? { s: clamp(hsva.s - step) }
      : e.key === 'ArrowRight' ? { s: clamp(hsva.s + step) }
      : e.key === 'ArrowUp' ? { v: clamp(hsva.v + step) }
      : e.key === 'ArrowDown' ? { v: clamp(hsva.v - step) }
      : e.key === 'PageUp' ? { v: clamp(hsva.v + 0.1) }
      : e.key === 'PageDown' ? { v: clamp(hsva.v - 0.1) }
      : e.key === 'Home' ? { s: 0 }
      : e.key === 'End' ? { s: 1 }
      : null
    if (!move) return
    e.preventDefault()
    update(move, true)
  }
  const color = formatHex({ ...hsvaToRgba({ ...hsva, a: 1 }) })
  return (
    <div
      className={`cp-area${dragging ? ' is-dragging' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--cp-hue': `hsl(${hsva.h} 100% 50%)` }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsva.s * 100)}
      aria-valuetext={`Saturación ${Math.round(hsva.s * 100)} %, brillo ${Math.round(hsva.v * 100)} %`}
      onKeyDown={onKey}
      {...handlers}
    >
      <span className="cp-thumb" style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, '--cp-color': color }}>
        <i className="cp-loupe" />
      </span>
    </div>
  )
}

function LinearSlider({
  label, className, value, max, valueText, background, onValue, thumbColor,
}: {
  label: string
  className: string
  value: number
  max: number
  valueText: string
  background: string
  onValue: (value: number, commit: boolean) => void
  thumbColor: string
}) {
  const { dragging, handlers } = useDrag(
    (x) => onValue(x * max, false),
    () => onValue(NaN, true),
  )
  const onKey = (e: KeyboardEvent) => {
    const unit = max / (max === 360 ? 360 : 100)
    const step = (e.shiftKey ? 10 : 1) * unit
    const next =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? value - step
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? value + step
      : e.key === 'PageDown' ? value - 10 * unit
      : e.key === 'PageUp' ? value + 10 * unit
      : e.key === 'Home' ? 0
      : e.key === 'End' ? max
      : null
    if (next === null) return
    e.preventDefault()
    onValue(clamp(next, 0, max), true)
  }
  return (
    <div
      className={`cp-slider ${className}${dragging ? ' is-dragging' : ''}`}
      style={{ '--cp-track': background }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max === 360 ? 360 : 100}
      aria-valuenow={Math.round(max === 360 ? value : (value / max) * 100)}
      aria-valuetext={valueText}
      onKeyDown={onKey}
      {...handlers}
    >
      <span className="cp-thumb" style={{ left: `${(value / max) * 100}%`, '--cp-color': thumbColor }}>
        <i className="cp-loupe" />
      </span>
    </div>
  )
}

export function ColorPickerHue({ label = 'Tono', className = '' }: { label?: string; className?: string }) {
  const { hsva, update, commit } = usePicker()
  return (
    <LinearSlider
      label={label}
      className={`cp-hue ${className}`}
      value={hsva.h}
      max={360}
      valueText={`${Math.round(hsva.h)} grados`}
      background="linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)"
      thumbColor={`hsl(${hsva.h} 100% 50%)`}
      onValue={(v, done) => (Number.isNaN(v) ? commit() : update({ h: v }, done))}
    />
  )
}

export function ColorPickerAlpha({ label = 'Opacidad', className = '' }: { label?: string; className?: string }) {
  const { hsva, update, commit, alpha, hex } = usePicker()
  if (!alpha) return null
  const solid = formatHex({ ...hsvaToRgba({ ...hsva, a: 1 }) })
  return (
    <LinearSlider
      label={label}
      className={`cp-alpha ${className}`}
      value={hsva.a}
      max={1}
      valueText={`${Math.round(hsva.a * 100)} %`}
      background={`linear-gradient(to right, transparent, ${solid})`}
      thumbColor={hex}
      onValue={(v, done) => (Number.isNaN(v) ? commit() : update({ a: v }, done))}
    />
  )
}

// ---------- campos ----------

export function ColorPickerSwatch({ className }: { className?: string }) {
  const { hex } = usePicker()
  return <span className={`cp-swatch${className ? ` ${className}` : ''}`} style={{ '--cp-color': hex }} aria-hidden="true" />
}

export function ColorPickerHexInput({ className }: { className?: string }) {
  const { hex, setHex, alpha } = usePicker()
  const [draft, setDraft] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const shown = draft ?? hex
  const commit = () => {
    if (draft === null) return
    if (!setHex(draft)) setShake((n) => n + 1)
    setDraft(null)
  }
  return (
    <input
      key={shake}
      type="text"
      className={`cp-hex${shake ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`}
      aria-label="Valor hexadecimal"
      spellcheck={false}
      maxLength={alpha ? 9 : 7}
      value={shown}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(null)
        }
      }}
    />
  )
}

export function ColorPickerChannels({ format = 'rgb', className }: { format?: 'rgb' | 'hsl'; className?: string }) {
  const { hsva, update, alpha } = usePicker()
  const rgba = hsvaToRgba(hsva)
  const hsl = rgbaToHsl(rgba)
  const fields =
    format === 'rgb'
      ? [
          { id: 'r', label: 'Rojo', value: Math.round(rgba.r), max: 255 },
          { id: 'g', label: 'Verde', value: Math.round(rgba.g), max: 255 },
          { id: 'b', label: 'Azul', value: Math.round(rgba.b), max: 255 },
        ]
      : [
          { id: 'h', label: 'Tono', value: Math.round(hsl.h), max: 360 },
          { id: 's', label: 'Saturación', value: Math.round(hsl.s * 100), max: 100 },
          { id: 'l', label: 'Luminosidad', value: Math.round(hsl.l * 100), max: 100 },
        ]
  const set = (id: string, n: number) => {
    if (format === 'rgb') {
      update(rgbaToHsva({ ...rgba, [id]: clamp(n, 0, 255) } as Rgba, hsva.h), true)
    } else {
      const next = { ...hsl, [id]: id === 'h' ? clamp(n, 0, 360) : clamp(n / 100) }
      update(rgbaToHsva(hslToRgba(next.h, next.s, next.l, hsva.a), next.h), true)
    }
  }
  return (
    <div className={`cp-channels${className ? ` ${className}` : ''}`}>
      {fields.map((f) => (
        <input
          key={`${format}-${f.id}`}
          type="number"
          aria-label={f.label}
          min={0}
          max={f.max}
          value={f.value}
          onChange={(e) => {
            const n = e.currentTarget.valueAsNumber
            if (Number.isNaN(n)) e.currentTarget.value = String(f.value)
            else set(f.id, n)
          }}
        />
      ))}
      {alpha && (
        <input
          type="number"
          aria-label="Opacidad"
          min={0}
          max={100}
          value={Math.round(hsva.a * 100)}
          onChange={(e) => {
            const n = e.currentTarget.valueAsNumber
            if (Number.isNaN(n)) e.currentTarget.value = String(Math.round(hsva.a * 100))
            else update({ a: clamp(n / 100) }, true)
          }}
        />
      )}
    </div>
  )
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

export function ColorPickerEyeDropper({ className }: { className?: string }) {
  const { setHex } = usePicker()
  const Dropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
  if (!Dropper) return null // solo existe en navegadores compatibles
  return (
    <button
      type="button"
      className={`btn btn-icon cp-dropper${className ? ` ${className}` : ''}`}
      aria-label="Tomar color de la pantalla"
      title="Tomar color de la pantalla"
      onClick={async () => {
        try {
          setHex((await new Dropper().open()).sRGBHex)
        } catch {
          // el usuario canceló
        }
      }}
    >
      <Icon name="dropper" />
    </button>
  )
}

export function ColorPickerPresets({ children, className, ...rest }: { children?: ComponentChildren; className?: string; 'aria-label'?: string }) {
  return (
    <div className={`cp-presets${className ? ` ${className}` : ''}`} role="group" aria-label={rest['aria-label'] ?? 'Colores predefinidos'}>
      {children}
    </div>
  )
}

export function ColorPickerPreset({ value, label, className }: { value: string; label?: string; className?: string }) {
  const { hex, setHex } = usePicker()
  const parsed = parseHex(value)
  const selected = parsed !== null && formatHex(parsed) === hex
  return (
    <button
      type="button"
      className={`cp-preset${className ? ` ${className}` : ''}`}
      style={{ '--cp-color': value }}
      aria-label={label ?? value}
      title={label ?? value}
      aria-pressed={selected}
      onClick={() => setHex(value)}
    />
  )
}

// ---------- panel completo ----------

const FORMATS = ['hex', 'rgb', 'hsl'] as const

/** Contenido del panel de `ColorField`: área, tono, opacidad, formatos, cuentagotas y preajustes. */
export function ColorFieldPanel({
  label, align, presets,
}: {
  label: string
  align: 'start' | 'end'
  presets?: { value: string; label: string }[]
}) {
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('hex')
  const next = FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length]
  return (
    <ColorPickerContent aria-label={label} align={align}>
      <ColorPickerArea />
      <div className="cp-row">
        <ColorPickerEyeDropper />
        <div className="cp-sliders">
          <ColorPickerHue />
          <ColorPickerAlpha />
        </div>
      </div>
      <div className="cp-row cp-fields">
        <button
          type="button"
          className="btn cp-format"
          aria-label={`Formato ${format.toUpperCase()}, cambiar a ${next.toUpperCase()}`}
          onClick={() => setFormat(next)}
        >
          {format.toUpperCase()}
        </button>
        {format === 'hex' ? <ColorPickerHexInput /> : <ColorPickerChannels format={format} />}
        {format === 'hex' && <ColorPickerSwatch />}
      </div>
      {presets && (
        <ColorPickerPresets>
          {presets.map((p) => (
            <ColorPickerPreset key={p.value} value={p.value} label={p.label} />
          ))}
        </ColorPickerPresets>
      )}
    </ColorPickerContent>
  )
}

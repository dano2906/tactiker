import type { RefObject } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import {
  DEFAULT_VIEW, computeGeometry, renderPitchLayer, renderScene, type Geometry,
} from './draw'
import type { Mode } from './modes'
import { positionsAt, type Positions } from './recording'
import type { LabelMode } from './roster'
import type { SceneData } from './storage'
import { buildTokens } from './tokens'

export interface MiniApi {
  draw: (positions: Positions) => void
}

interface Props {
  /** Modalidad de la jugada (sin las medidas personalizadas) y con ellas. */
  baseMode: Mode
  mode: Mode
  data: SceneData
  /** Instante (ms) que se muestra cuando no hay reproducción en curso. */
  elapsed: number
  showTrails: boolean
  labelMode: LabelMode
  apiRef: RefObject<MiniApi | null>
}

const OFF = { lines: false, block: false, coverage: false, control: false }

/** Otra jugada en solo lectura, para compararla lado a lado con la que se edita. */
function MiniPitch({ baseMode, mode, data, elapsed, showTrails, labelMode, apiRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ mode, data, showTrails, labelMode, elapsed, baseMode })
  latest.current = { mode, data, showTrails, labelMode, elapsed, baseMode }
  const overrideRef = useRef<Positions | null>(null)
  const layerRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)

  const paint = () => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const { mode: m, data: d, showTrails: trails, labelMode: label, elapsed: t, baseMode: base } = latest.current
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    if (cw === 0 || ch === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(cw * dpr)
    const h = Math.round(ch * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
    }
    const geo: Geometry = computeGeometry(m, cw, ch, DEFAULT_VIEW)
    const key = `${m.id}|${m.length}|${m.width}|${w}|${h}`
    if (layerRef.current?.key !== key) {
      const layer = document.createElement('canvas')
      layer.width = w
      layer.height = h
      const lctx = layer.getContext('2d')!
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      renderPitchLayer(lctx, m, geo, cw, ch)
      layerRef.current = { key, canvas: layer }
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(layerRef.current.canvas, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const positions = overrideRef.current ?? positionsAt(d.start, d.movements, t)
    renderScene(ctx, {
      mode: m,
      geo,
      positions,
      colors: d.colors,
      tokens: buildTokens(Object.keys(positions), d.roster, label, d.teams, base),
      trails: trails ? d.movements : [],
      selectedMovement: null,
      handles: false,
      endMovable: false,
      selected: null,
      carrier: null,
      measures: false,
      analysis: OFF,
      zones: 'off',
      network: null,
      groups: { left: [], right: [] },
      annotations: d.annotations,
      drawing: null,
      drags: [],
      ghost: null,
    })
  }

  useEffect(() => {
    apiRef.current = {
      draw: (positions) => {
        overrideRef.current = positions
        paint()
      },
    }
    const observer = new ResizeObserver(paint)
    observer.observe(wrapRef.current!)
    return () => {
      observer.disconnect()
      apiRef.current = null
    }
  }, [])

  // Con el estado de la interfaz (parado o buscando en la línea de tiempo) mandan sus valores.
  useEffect(() => {
    overrideRef.current = null
    paint()
  }, [elapsed, data, mode, showTrails, labelMode])

  return (
    <div ref={wrapRef} className="mini-wrap">
      <canvas ref={canvasRef} aria-label="Jugada comparada" />
    </div>
  )
}

export default MiniPitch

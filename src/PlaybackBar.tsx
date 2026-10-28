import type { RefObject } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import Icon from './Icon'

/** Actualiza el progreso sin volver a pintar el componente (para la reproducción fotograma a fotograma). */
export interface BarApi {
  update: (elapsed: number) => void
}

interface Props {
  apiRef: RefObject<BarApi | null>
  disabled: boolean
  playing: boolean
  elapsed: number
  total: number
  speed: number
  speeds: number[]
  onTogglePlay: () => void
  onSeek: (ms: number) => void
  onStep: (direction: -1 | 1) => void
  onSpeed: (speed: number) => void
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

function PlaybackBar({
  apiRef, disabled, playing, elapsed, total, speed, speeds,
  onTogglePlay, onSeek, onStep, onSpeed,
}: Props) {
  const rangeRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    apiRef.current = {
      update: (ms) => {
        if (rangeRef.current) rangeRef.current.value = String(ms)
        // Se modifica el mismo nodo de texto para no desincronizar al renderizador.
        const text = timeRef.current?.firstChild
        if (text) text.nodeValue = `${seconds(ms)} / ${seconds(total)}`
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [total])

  return (
    <div className="playback-bar">
      <div className="transport">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Movimiento anterior" disabled={disabled} onClick={() => onStep(-1)}>
          <Icon name="back" />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-icon play"
          aria-label={playing ? 'Pausa' : 'Play'}
          disabled={disabled}
          onClick={onTogglePlay}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Movimiento siguiente" disabled={disabled} onClick={() => onStep(1)}>
          <Icon name="fwd" />
        </button>
      </div>
      <input
        ref={rangeRef}
        type="range"
        aria-label="Progreso de la reproducción"
        min={0}
        max={Math.max(total, 1)}
        step={10}
        value={Math.min(elapsed, total)}
        disabled={disabled}
        onInput={(e) => onSeek(Number(e.currentTarget.value))}
      />
      <span ref={timeRef} className="time">
        {`${seconds(Math.min(elapsed, total))} / ${seconds(total)}`}
      </span>
      <div className="speeds" role="group" aria-label="Velocidad de reproducción">
        {speeds.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn btn-sm${s === speed ? ' active' : ''}`}
            aria-pressed={s === speed}
            onClick={() => onSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

export default PlaybackBar

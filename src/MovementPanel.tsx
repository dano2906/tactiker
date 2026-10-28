import Icon from './Icon'

interface Props {
  title: string
  distance: number
  /** Segundos. */
  duration: number
  delay: number
  speedKmh: number
  /** Velocidad realista que se aplica con el botón (km/h). */
  realisticKmh: number
  disabled: boolean
  /** `null` si se puede borrar; si no, el motivo. */
  removeBlocked: string | null
  onDuration: (seconds: number) => void
  onDelay: (seconds: number) => void
  onSpeed: (kmh: number) => void
  onRealistic: () => void
  onRemove: () => void
  onClose: () => void
}

const fmt = (n: number) => String(Math.round(n * 100) / 100)

/** Campo numérico que confirma al salir; si el valor no es válido, vuelve al anterior. */
function NumberField({
  label, value, min, disabled, onCommit,
}: {
  label: string
  value: number
  min: number
  disabled: boolean
  onCommit: (value: number) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        step={0.1}
        value={fmt(value)}
        disabled={disabled}
        onChange={(e) => {
          const input = e.currentTarget
          const n = input.valueAsNumber
          if (Number.isNaN(n) || n < min) input.value = fmt(value)
          else onCommit(n)
        }}
      />
    </label>
  )
}

function MovementPanel({
  title, distance, duration, delay, speedKmh, realisticKmh, disabled, removeBlocked,
  onDuration, onDelay, onSpeed, onRealistic, onRemove, onClose,
}: Props) {
  return (
    <div className="player-panel movement-panel">
      <div className="panel-head">
        <strong>{title}</strong>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar" onClick={onClose}><Icon name="x" /></button>
      </div>
      <p className="player-stats">Recorrido: {distance.toFixed(1).replace('.', ',')} m</p>
      <NumberField label="Duración (s)" value={duration} min={0.3} disabled={disabled} onCommit={onDuration} />
      <NumberField label="Pausa antes (s)" value={delay} min={0} disabled={disabled} onCommit={onDelay} />
      <NumberField label="Velocidad (km/h)" value={speedKmh} min={0.5} disabled={disabled} onCommit={onSpeed} />
      <button
        type="button"
        disabled={disabled}
        title="Ajusta la duración a una velocidad media realista"
        onClick={onRealistic}
      >
        Velocidad realista ({realisticKmh} km/h)
      </button>
      <button
        type="button"
        disabled={disabled || removeBlocked !== null}
        title={removeBlocked ?? 'Borra este movimiento'}
        onClick={onRemove}
      >
        Borrar movimiento
      </button>
    </div>
  )
}

export default MovementPanel

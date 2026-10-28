import type { PlayerInfo } from './roster'
import Icon from './Icon'
import { Avatar } from './Avatar'
import type { SquadPlayer } from './squad'

interface Props {
  title: string
  info: PlayerInfo
  defaultDorsal: number
  defaultRole: string
  disabled: boolean
  sizeRange: readonly [number, number]
  /** `null` si se puede quitar la ficha; si no, el motivo. */
  removeBlocked: string | null
  onRemove: () => void
  squad: SquadPlayer[]
  /** Vacío = desvincular. */
  onAssignPlayer: (id: string) => void
  /** Metros que recorre esta ficha en la jugada. */
  distance: number
  carrying: boolean
  /** `null` si se puede dar el balón; si no, el motivo. */
  giveBallBlocked: string | null
  onGiveBall: () => void
  onChange: (patch: PlayerInfo) => void
  onReset: () => void
  onClose: () => void
}

function PlayerPanel({
  title, info, defaultDorsal, defaultRole, disabled, sizeRange, removeBlocked, onRemove, squad, onAssignPlayer, distance, carrying,
  giveBallBlocked, onGiveBall, onChange, onReset, onClose,
}: Props) {
  return (
    <div className="player-panel">
      <div className="panel-head">
        <strong>{title}</strong>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar" onClick={onClose}><Icon name="x" /></button>
      </div>
      {squad.length > 0 && (
        <label>
          Jugador del plantel
          <select value={info.squadId ?? ''} disabled={disabled} onChange={(e) => onAssignPlayer(e.currentTarget.value)}>
            <option value="">Ninguno</option>
            {squad.map((p) => (
              <option key={p.id} value={p.id}>{p.dorsal} {p.name}</option>
            ))}
          </select>
        </label>
      )}
      {info.photo && (
        <div className="row">
          <Avatar player={{ name: info.name ?? '', photo: info.photo }} />
          <span className="player-stats">{info.name}</span>
        </div>
      )}
      <label>
        Dorsal
        <input
          type="number"
          min={0}
          max={99}
          value={info.dorsal ?? defaultDorsal}
          disabled={disabled}
          onInput={(e) => {
            const n = e.currentTarget.valueAsNumber
            onChange({ dorsal: Number.isNaN(n) ? undefined : Math.min(99, Math.max(0, Math.round(n))) })
          }}
        />
      </label>
      <label>
        Nombre
        <input
          type="text"
          maxLength={30}
          value={info.name ?? ''}
          disabled={disabled}
          onInput={(e) => onChange({ name: e.currentTarget.value })}
        />
      </label>
      <label>
        Posición
        <input
          type="text"
          maxLength={6}
          value={info.role ?? defaultRole}
          disabled={disabled}
          onInput={(e) => onChange({ role: e.currentTarget.value })}
        />
      </label>
      <label>
        Tamaño
        <input
          type="range"
          min={sizeRange[0]}
          max={sizeRange[1]}
          step={0.1}
          value={info.size ?? 1}
          disabled={disabled}
          onInput={(e) => onChange({ size: Number(e.currentTarget.value) })}
        />
      </label>
      <p className="player-stats">
        Recorrido: {distance.toFixed(1).replace('.', ',')} m{carrying ? ' · lleva el balón' : ''}
      </p>
      <button
        type="button"
        disabled={disabled || giveBallBlocked !== null}
        title={giveBallBlocked ?? 'El balón empieza pegado a esta ficha'}
        onClick={onGiveBall}
      >
        Dar balón
      </button>
      <button type="button" disabled={disabled} onClick={onReset}>Restablecer</button>
      <button
        type="button"
        disabled={disabled || removeBlocked !== null}
        title={removeBlocked ?? 'Quita esta ficha del terreno'}
        onClick={onRemove}
      >
        Quitar ficha
      </button>
    </div>
  )
}

export default PlayerPanel

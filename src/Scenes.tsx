import Icon from './Icon'

interface Props {
  names: string[]
  active: number
  disabled: boolean
  sequencing: boolean
  onSelect: (index: number) => void
  onPlayAll: () => void
  onStopAll: () => void
  onAdd: () => void
  onContinue: () => void
  onDelete: (index: number) => void
  onDuplicate: () => void
  /** Otra jugada que se superpone a la actual para compararlas. */
  compareIndex: number | null
  onCompare: (index: number | null) => void
  compareMode: 'overlay' | 'split'
  onCompareMode: (mode: 'overlay' | 'split') => void
  onRename: (index: number, name: string) => void
}

function Scenes({ names, active, disabled, sequencing, onPlayAll, onStopAll, onSelect, onAdd, onContinue, onDelete, onDuplicate, compareIndex, onCompare, compareMode, onCompareMode, onRename }: Props) {
  return (
    <>
      <h2>Jugadas</h2>
      <div className="scene-tabs" role="tablist">
        {names.map((name, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            disabled={disabled}
            title={name}
            onClick={() => onSelect(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <input
        type="text"
        aria-label="Nombre de la jugada"
        value={names[active]}
        maxLength={40}
        disabled={disabled}
        onInput={(e) => onRename(active, e.currentTarget.value)}
      />
      <div className="row">
        <button type="button" disabled={disabled} title="Nueva jugada con la formación inicial" onClick={onAdd}>
          + Nueva
        </button>
        <button
          type="button"
          disabled={disabled}
          title="Nueva jugada que parte de las posiciones finales de esta"
          onClick={onContinue}
        >
          Continuar
        </button>
        <button
          type="button"
          disabled={disabled || names.length < 2}
          title="Borrar esta jugada"
          aria-label="Borrar jugada"
          onClick={() => onDelete(active)}
        >
          <Icon name="trash" />
        </button>
      </div>
      <button type="button" disabled={disabled} title="Copia esta jugada y trabaja en la copia" onClick={onDuplicate}>
        Duplicar jugada
      </button>
      {names.length > 1 && (
        <button
          type="button"
          disabled={!sequencing && disabled}
          title="Reproduce todas las jugadas una tras otra"
          onClick={sequencing ? onStopAll : onPlayAll}
        >
          <Icon name={sequencing ? 'stop' : 'play'} />
          {sequencing ? 'Detener secuencia' : 'Reproducir todas'}
        </button>
      )}
      {names.length > 1 && (
        <label className="check" title="Superpone otra jugada, en tenue, y se reproduce a la vez">
          Comparar con
          <select
            value={compareIndex === null || compareIndex === active ? '' : String(compareIndex)}
            onChange={(e) => onCompare(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
          >
            <option value="">Ninguna</option>
            {names.map((n, i) =>
              i === active ? null : (
                <option key={i} value={i}>
                  {i + 1}. {n}
                </option>
              ),
            )}
          </select>
        </label>
      )}
      {names.length > 1 && compareIndex !== null && compareIndex !== active && (
        <div className="row" role="group" aria-label="Forma de comparar">
          <button type="button" className={`btn btn-sm${compareMode === 'overlay' ? ' active' : ''}`} aria-pressed={compareMode === 'overlay'} onClick={() => onCompareMode('overlay')}>Superponer</button>
          <button type="button" className={`btn btn-sm${compareMode === 'split' ? ' active' : ''}`} aria-pressed={compareMode === 'split'} onClick={() => onCompareMode('split')}>Lado a lado</button>
        </div>
      )}
    </>
  )
}

export default Scenes

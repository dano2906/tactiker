import { useRef, useState } from 'preact/hooks'
import { MODES } from './modes'
import type { Tactic } from './storage'
import Icon from './Icon'

interface Props {
  tactics: Tactic[]
  disabled: boolean
  onSave: (name: string) => void
  onLoad: (tactic: Tactic) => void
  onDelete: (id: string) => void
  onExport: (tactic: Tactic) => void
  onImport: (file: File) => void
}

function SavedTactics({ tactics, disabled, onSave, onLoad, onDelete, onExport, onImport }: Props) {
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    onSave(name.trim() || 'Sin nombre')
    setName('')
  }

  return (
    <>
      <h2>Tácticas guardadas</h2>
      <form
        className="save-form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          type="text"
          placeholder="Nombre de la táctica"
          value={name}
          maxLength={40}
          disabled={disabled}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <button type="submit" disabled={disabled}>Guardar</button>
      </form>
      <ul className="tactic-list">
        {tactics.map((t) => (
          <li key={t.id}>
            <span className="tactic-name" title={t.name}>
              {t.name}
              <small>{MODES.find((m) => m.id === t.scenes[0].modeId)?.label} · {t.scenes.length} jugada{t.scenes.length === 1 ? '' : 's'}</small>
            </span>
            <button type="button" disabled={disabled} onClick={() => onLoad(t)}>Cargar</button>
            <button type="button" aria-label={`Exportar ${t.name}`} title="Exportar JSON" onClick={() => onExport(t)}><Icon name="download" /></button>
            <button type="button" aria-label={`Borrar ${t.name}`} title="Borrar" disabled={disabled} onClick={() => onDelete(t.id)}><Icon name="trash" /></button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={disabled} onClick={() => fileRef.current?.click()}>
        Importar JSON
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const input = e.currentTarget
          const file = input.files?.[0]
          if (file) onImport(file)
          input.value = ''
        }}
      />
    </>
  )
}

export default SavedTactics

import { useMemo, useRef, useState } from 'preact/hooks'
import { MODES } from './modes'
import type { Tactic } from './storage'
import Icon from './Icon'

interface Props {
  tactics: Tactic[]
  disabled: boolean
  onSave: (name: string, tags: string[]) => void
  onLoad: (tactic: Tactic) => void
  onDelete: (id: string) => void
  onExport: (tactic: Tactic) => void
  onImport: (file: File) => void
  onTags: (id: string, tags: string[]) => void
}

/** Etiquetas que se sugieren al guardar (se pueden escribir otras). */
const SUGGESTED_TAGS = ['Ataque', 'Defensa', 'Balón parado', 'Transición', 'Salida de balón', 'Presión', 'Ejercicio']

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const parseTags = (text: string) =>
  [...new Set(text.split(',').map((t) => t.trim().slice(0, 24)).filter(Boolean))].slice(0, 8)

/** Biblioteca de tácticas: guardar con etiquetas, buscar por nombre o etiqueta y filtrar por etiqueta. */
function SavedTactics({ tactics, disabled, onSave, onLoad, onDelete, onExport, onImport, onTags }: Props) {
  const [name, setName] = useState('')
  const [tagText, setTagText] = useState('')
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const allTags = useMemo(
    () => [...new Set(tactics.flatMap((t) => t.tags ?? []))].sort((a, b) => a.localeCompare(b, 'es')),
    [tactics],
  )

  const visible = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    return tactics.filter((t) => {
      if (activeTag && !(t.tags ?? []).includes(activeTag)) return false
      const haystack = normalize(`${t.name} ${(t.tags ?? []).join(' ')}`)
      return words.every((w) => haystack.includes(w))
    })
  }, [tactics, query, activeTag])

  const save = () => {
    onSave(name.trim() || 'Sin nombre', parseTags(tagText))
    setName('')
    setTagText('')
  }

  return (
    <section>
      <h3>Biblioteca de tácticas</h3>
      <form
        className="save-form column"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          type="text"
          placeholder="Nombre de la táctica"
          aria-label="Nombre de la táctica"
          value={name}
          maxLength={40}
          disabled={disabled}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <div className="row">
          <input
            type="text"
            list="tag-suggestions"
            placeholder="Etiquetas, separadas por comas"
            aria-label="Etiquetas"
            value={tagText}
            disabled={disabled}
            onInput={(e) => setTagText(e.currentTarget.value)}
          />
          <datalist id="tag-suggestions">{SUGGESTED_TAGS.map((t) => <option key={t} value={t} />)}</datalist>
          <button type="submit" className="btn btn-sm" disabled={disabled}>Guardar</button>
        </div>
      </form>

      {tactics.length > 0 && (
        <input
          type="search"
          className="search"
          placeholder={`Buscar entre ${tactics.length} táctica${tactics.length === 1 ? '' : 's'}…`}
          aria-label="Buscar tácticas"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      )}
      {allTags.length > 0 && (
        <div className="chips" role="group" aria-label="Filtrar por etiqueta">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`btn btn-sm${activeTag === tag ? ' active' : ''}`}
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <ul className="tactic-list">
        {visible.map((t) => (
          <li key={t.id}>
            <div className="tactic-row">
              <span className="tactic-name" title={t.name}>
                {t.name}
                <small>{MODES.find((m) => m.id === t.scenes[0].modeId)?.label} · {t.scenes.length} jugada{t.scenes.length === 1 ? '' : 's'}</small>
              </span>
              <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onLoad(t)}>Abrir</button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Etiquetas de ${t.name}`} title="Editar etiquetas" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                <Icon name="sliders" />
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Exportar ${t.name}`} title="Exportar JSON" onClick={() => onExport(t)}><Icon name="download" /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Borrar ${t.name}`} title="Borrar" disabled={disabled} onClick={() => onDelete(t.id)}><Icon name="trash" /></button>
            </div>
            {(t.tags?.length ?? 0) > 0 && (
              <div className="chips">
                {t.tags!.map((tag) => <span key={tag} className="badge">{tag}</span>)}
              </div>
            )}
            {editing === t.id && (
              <input
                type="text"
                aria-label={`Etiquetas de ${t.name}`}
                placeholder="Etiquetas, separadas por comas (Intro para guardar)"
                defaultValue={(t.tags ?? []).join(', ')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onTags(t.id, parseTags(e.currentTarget.value))
                    setEditing(null)
                  } else if (e.key === 'Escape') setEditing(null)
                }}
              />
            )}
          </li>
        ))}
        {tactics.length > 0 && visible.length === 0 && <li className="empty">Ninguna táctica coincide con la búsqueda.</li>}
      </ul>

      <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" />Importar JSON
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
    </section>
  )
}

export default SavedTactics

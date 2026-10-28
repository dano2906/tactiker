import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import Icon from './Icon'
import { SHORTCUTS } from './shortcuts'

export interface Command {
  id: string
  label: string
  group: string
  /** Texto extra para la búsqueda (sinónimos). */
  keywords?: string
  /** Ayuda a la derecha (por ejemplo, el atajo). */
  hint?: string
  disabled?: boolean
  run: () => void
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

interface Props {
  open: boolean
  commands: Command[]
  onClose: () => void
}

/** Paleta de comandos (Ctrl K): busca entre todas las acciones de la app y las ejecuta con Enter. */
export function CommandPalette({ open, commands, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setQuery('')
      setIndex(0)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const results = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    return commands.filter((c) => {
      const haystack = normalize(`${c.label} ${c.group} ${c.keywords ?? ''}`)
      return words.every((w) => haystack.includes(w))
    })
  }, [commands, query])

  const active = Math.min(index, Math.max(0, results.length - 1))

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  const run = (command: Command | undefined) => {
    if (!command || command.disabled) return
    onClose()
    // Se ejecuta tras cerrar el diálogo para que el foco vuelva al terreno antes de la acción.
    setTimeout(command.run, 0)
  }

  let lastGroup = ''
  return (
    <dialog
      ref={dialogRef}
      className="palette glass"
      aria-label="Paleta de comandos"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="palette-search">
        <Icon name="search" />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-label="Buscar un comando"
          placeholder="Buscar una acción, plantilla o jugada…"
          value={query}
          autoFocus
          onInput={(e) => {
            setQuery(e.currentTarget.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex(Math.min(results.length - 1, active + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex(Math.max(0, active - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(results[active])
            }
          }}
        />
        <span className="kbd">Esc</span>
      </div>
      <ul id="palette-list" ref={listRef} role="listbox" className="palette-list">
        {results.length === 0 && <li className="palette-empty">No hay nada que coincida con «{query}».</li>}
        {results.map((c, i) => {
          const header = c.group !== lastGroup
          lastGroup = c.group
          return (
            <>
              {header && <li className="palette-group" role="presentation">{c.group}</li>}
              <li
                key={c.id}
                role="option"
                aria-selected={i === active}
                aria-disabled={c.disabled}
                className="palette-item"
                onPointerMove={() => setIndex(i)}
                onClick={() => run(c)}
              >
                <span>{c.label}</span>
                {c.hint && <span className="kbd">{c.hint}</span>}
              </li>
            </>
          )
        })}
      </ul>
    </dialog>
  )
}

/** Ayuda con todos los atajos de teclado. */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))]
  return (
    <dialog
      ref={ref}
      className="palette glass shortcuts"
      aria-label="Atajos de teclado"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="shortcuts-head">
        <h2>Atajos de teclado</h2>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="shortcuts-body">
        {groups.map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                <div key={s.keys}>
                  <dt>{s.label}</dt>
                  <dd><span className="kbd">{s.keys}</span></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  )
}

import { useState } from 'preact/hooks'
import { Avatar } from './Avatar'
import Icon from './Icon'
import { downscaleImage } from './imageUtils'
import type { Side } from './modes'
import { SIDE_LABELS } from './modes'
import type { SquadPlayer } from './squad'

interface Props {
  squad: SquadPlayer[]
  /** Ficha seleccionada en el terreno (a la que se puede asignar un jugador). */
  selectedKey: string | null
  disabled: boolean
  onChange: (list: SquadPlayer[]) => void
  onAssign: (player: SquadPlayer) => void
  onFillTeam: (side: Side) => void
  onNotice: (text: string) => void
}

const ROLES = ['POR', 'DEF', 'LAT', 'CEN', 'MED', 'EXT', 'DEL']

const emptyForm = (): SquadPlayer => ({ id: '', name: '', dorsal: 0, role: '' })

/** Plantel: lista de jugadores reutilizable entre jugadas y tácticas. */
function SquadPanel({ squad, selectedKey, disabled, onChange, onAssign, onFillTeam, onNotice }: Props) {
  const [form, setForm] = useState<SquadPlayer | null>(null)

  const save = () => {
    if (!form || !form.name.trim()) return
    const player = { ...form, name: form.name.trim(), id: form.id || crypto.randomUUID() }
    onChange(form.id ? squad.map((p) => (p.id === form.id ? player : p)) : [...squad, player])
    setForm(null)
  }

  const choosePhoto = async (file: File) => {
    try {
      const photo = await downscaleImage(file, 128, { square: true, quality: 0.8 })
      setForm((f) => (f ? { ...f, photo } : f))
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'No se pudo abrir la foto.')
    }
  }

  return (
    <>
      <section>
        <h3>Plantel</h3>
        {squad.length === 0 && !form && (
          <p className="empty">Añade a tus jugadores una vez y reutilízalos en todas las jugadas y tácticas.</p>
        )}
        <ul className="squad-list">
          {squad.map((p) => (
            <li key={p.id}>
              <Avatar player={p} />
              <span className="squad-name">
                <strong>{p.dorsal} {p.name}</strong>
                <small>{p.role || 'Sin posición'}</small>
              </span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={disabled || !selectedKey}
                title={selectedKey ? 'Asignar a la ficha seleccionada' : 'Selecciona antes una ficha en el terreno'}
                onClick={() => onAssign(p)}
              >
                Asignar
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Editar a ${p.name}`} onClick={() => setForm({ ...p })}>
                <Icon name="pen" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Quitar a ${p.name}`}
                onClick={() => onChange(squad.filter((x) => x.id !== p.id))}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
        {!form && (
          <button type="button" className="btn btn-sm" onClick={() => setForm(emptyForm())}>
            <Icon name="plus" />Añadir jugador
          </button>
        )}
      </section>

      {form && (
        <section>
          <h3>{form.id ? 'Editar jugador' : 'Nuevo jugador'}</h3>
          <form
            className="squad-form"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="row">
              <Avatar player={form} />
              <label className="btn btn-sm file-btn">
                Foto…
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0]
                    if (file) choosePhoto(file)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              {form.photo && (
                <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, photo: undefined })}>Quitar foto</button>
              )}
            </div>
            <label>
              <span>Nombre</span>
              <input type="text" value={form.name} maxLength={30} autoFocus onInput={(e) => setForm({ ...form, name: e.currentTarget.value })} />
            </label>
            <div className="size-inputs">
              <label>
                <span>Dorsal</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={form.dorsal}
                  onChange={(e) => setForm({ ...form, dorsal: Math.min(99, Math.max(0, Math.round(e.currentTarget.valueAsNumber || 0))) })}
                />
              </label>
              <label>
                <span>Posición</span>
                <input
                  type="text"
                  list="squad-roles"
                  value={form.role}
                  maxLength={6}
                  onInput={(e) => setForm({ ...form, role: e.currentTarget.value.toUpperCase() })}
                />
                <datalist id="squad-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
              </label>
            </div>
            <div className="row">
              <button type="submit" className="btn btn-primary btn-sm" disabled={!form.name.trim()}>Guardar</button>
              <button type="button" className="btn btn-sm" onClick={() => setForm(null)}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {squad.length > 0 && (
        <section>
          <h3>Completar un equipo</h3>
          <div className="row">
            {(['left', 'right'] as const).map((side) => (
              <button key={side} type="button" className="btn btn-sm" disabled={disabled} onClick={() => onFillTeam(side)}>
                Equipo {SIDE_LABELS[side].toLowerCase()}
              </button>
            ))}
          </div>
          <p className="hint">Reparte el plantel por las fichas del equipo: el portero en la ficha 1 y el resto por dorsal.</p>
        </section>
      )}
    </>
  )
}

export default SquadPanel

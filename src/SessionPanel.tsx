import { MATERIALS, newSessionItem, totalMinutes, type SessionItem } from './session'
import Icon from './Icon'

interface Props {
  items: SessionItem[]
  sceneNames: string[]
  activeScene: number
  disabled: boolean
  running: boolean
  onChange: (items: SessionItem[]) => void
  onStart: () => void
  onGoTo: (scene: number) => void
}

/** Sesión de entrenamiento: ejercicios en orden, con duración, objetivo, material y la jugada que los ilustra. */
function SessionPanel({ items, sceneNames, activeScene, disabled, running, onChange, onStart, onGoTo }: Props) {
  const patch = (id: string, change: Partial<SessionItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...change } : i)))
  const move = (index: number, delta: number) => {
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    onChange(next)
  }

  return (
    <>
      <section>
        <h3>Sesión de entrenamiento</h3>
        <div className="row between">
          <span className="badge">{items.length} ejercicio{items.length === 1 ? '' : 's'} · {totalMinutes(items)} min</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={items.length === 0 || running || disabled} onClick={onStart}>
            <Icon name="play" />Iniciar
          </button>
        </div>
        {items.length === 0 && (
          <p className="empty">Ordena los ejercicios de la sesión y enlaza cada uno con una jugada de esta táctica. Al iniciarla verás el guion con un cronómetro.</p>
        )}
      </section>

      {items.map((item, index) => (
        <section key={item.id} className="session-item">
          <div className="row between">
            <h3>Ejercicio {index + 1}</h3>
            <span className="row">
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                <Icon name="chevron-up" />
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Bajar" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <Icon name="chevron-down" />
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Quitar ejercicio" onClick={() => onChange(items.filter((i) => i.id !== item.id))}>
                <Icon name="trash" />
              </button>
            </span>
          </div>
          <div className="session-fields">
            <label>
              <span>Título</span>
              <input type="text" value={item.title} maxLength={80} onInput={(e) => patch(item.id, { title: e.currentTarget.value })} />
            </label>
            <label>
              <span>Minutos</span>
              <input
                type="number"
                min={1}
                max={240}
                value={item.minutes}
                onChange={(e) => patch(item.id, { minutes: Math.min(240, Math.max(1, Math.round(e.currentTarget.valueAsNumber || 1))) })}
              />
            </label>
            <label>
              <span>Objetivo</span>
              <input type="text" value={item.objective} maxLength={300} placeholder="Qué se quiere conseguir" onInput={(e) => patch(item.id, { objective: e.currentTarget.value })} />
            </label>
            <div className="field">
              <span>Material</span>
              <div className="chips">
                {MATERIALS.map((m) => {
                  const on = item.material.includes(m)
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-sm${on ? ' active' : ''}`}
                      aria-pressed={on}
                      onClick={() => patch(item.id, { material: on ? item.material.filter((x) => x !== m) : [...item.material, m] })}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            </div>
            <label>
              <span>Jugada</span>
              <select
                value={item.scene === null ? '' : String(item.scene)}
                onChange={(e) => patch(item.id, { scene: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
              >
                <option value="">Ninguna</option>
                {sceneNames.map((n, i) => (
                  <option key={i} value={i}>{i + 1}. {n}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Notas</span>
              <textarea rows={2} maxLength={1000} value={item.notes} onInput={(e) => patch(item.id, { notes: e.currentTarget.value })} />
            </label>
          </div>
          {item.scene !== null && item.scene !== activeScene && item.scene < sceneNames.length && (
            <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onGoTo(item.scene!)}>
              Ver la jugada {item.scene + 1}
            </button>
          )}
        </section>
      ))}

      <section>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([...items, newSessionItem(items.length + 1, activeScene)])}
        >
          <Icon name="plus" />Añadir ejercicio
        </button>
      </section>
    </>
  )
}

export default SessionPanel

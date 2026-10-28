import type { Tool } from './annotations'
import { ColorField } from './ColorPicker'
import Icon from './Icon'
import { COLOR_PRESETS } from './roster'

interface Props {
  tool: Tool
  color: string
  count: number
  onTool: (tool: Tool) => void
  onColor: (color: string) => void
  onClear: () => void
}

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'select', icon: 'cursor', label: 'Mover / seleccionar' },
  { id: 'arrow', icon: 'arrow', label: 'Flecha' },
  { id: 'free', icon: 'pen', label: 'Trazo libre' },
  { id: 'curve', icon: 'curve', label: 'Flecha curva (a mano alzada)' },
  { id: 'zone', icon: 'zone', label: 'Zona' },
  { id: 'ellipse', icon: 'ellipse', label: 'Círculo / elipse' },
  { id: 'cone', icon: 'cone', label: 'Cono' },
  { id: 'text', icon: 'type', label: 'Texto' },
  { id: 'erase', icon: 'eraser', label: 'Borrar dibujo' },
]

function DrawToolbar({ tool, color, count, onTool, onColor, onClear }: Props) {
  return (
    <div className="draw-toolbar" role="toolbar" aria-label="Herramientas de dibujo">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="btn btn-ghost btn-icon"
          aria-pressed={t.id === tool}
          aria-label={t.label}
          title={t.label}
          onClick={() => onTool(t.id)}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      <ColorField label="Color del dibujo" value={color} onValueChange={onColor} presets={COLOR_PRESETS} />
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Borrar todos los dibujos"
        title="Borrar todos los dibujos"
        disabled={count === 0}
        onClick={onClear}
      >
        <Icon name="trash" />
      </button>
    </div>
  )
}

export default DrawToolbar

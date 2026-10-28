import type { RefObject } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { schedule, type Movement } from './recording'

/** Mueve la línea de reproducción sin volver a pintar el componente (se llama en cada fotograma). */
export interface TimelineApi {
  update: (elapsed: number) => void
}

interface Props {
  movements: Movement[]
  /** Duración total de la jugada (ms). */
  total: number
  elapsed: number
  selected: number | null
  disabled: boolean
  labelOf: (key: string) => string
  colorOf: (key: string) => string
  apiRef: RefObject<TimelineApi | null>
  onSelect: (index: number) => void
  /** `delay` y `duration` en ms; `delay` es el valor nuevo de la pausa previa. */
  onEdit: (index: number, edit: { delay?: number; duration?: number }) => void
}

interface Drag {
  pointerId: number
  index: number
  mode: 'move' | 'resize'
  startX: number
  element: HTMLElement
  startWidth: number
}

function Timeline({
  movements, total, elapsed, selected, disabled, labelOf, colorOf, apiRef, onSelect, onEdit,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const span = Math.max(total, 1)

  useEffect(() => {
    apiRef.current = {
      update: (ms) => {
        if (headRef.current) headRef.current.style.left = `${(ms / span) * 100}%`
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [span])

  const scheduled = schedule(movements)
  const keys = [...new Set(movements.map((m) => m.key))]

  /** Milisegundos que equivale un desplazamiento en píxeles de la pista. */
  const msPerPx = () => span / Math.max(1, gridRef.current!.querySelector('.tl-track')!.clientWidth)

  const handleDown = (e: PointerEvent, index: number, mode: Drag['mode']) => {
    e.stopPropagation()
    onSelect(index)
    if (disabled) return
    const element = e.currentTarget as HTMLElement
    const block = (mode === 'resize' ? element.parentElement : element) as HTMLElement
    element.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId, index, mode, startX: e.clientX, element: block, startWidth: block.offsetWidth,
    }
  }

  const handleMove = (e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    if (drag.mode === 'move') drag.element.style.transform = `translateX(${dx}px)`
    else drag.element.style.width = `${Math.max(6, drag.startWidth + dx)}px`
  }

  const handleUp = (e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    const dx = e.clientX - drag.startX
    drag.element.style.transform = ''
    drag.element.style.width = ''
    if (Math.abs(dx) < 3) return
    const ms = dx * msPerPx()
    if (drag.mode === 'move') {
      onEdit(drag.index, { delay: (movements[drag.index].delay ?? 0) + ms })
    } else {
      const s = scheduled[drag.index]
      onEdit(drag.index, { duration: s.end - s.start + ms })
    }
  }

  return (
    <div className="timeline" aria-label="Línea de tiempo por jugador">
      <div className="tl-grid" ref={gridRef}>
        {keys.map((key) => (
          <div className="tl-row" key={key}>
            <span className="tl-label" style={{ color: colorOf(key) }}>{labelOf(key)}</span>
            <div className="tl-track">
              {scheduled
                .filter((s) => s.key === key)
                .map((s) => {
                  const linked = movements[s.index].linked
                  return (
                    <div
                      key={s.index}
                      className={`tl-block${selected === s.index ? ' selected' : ''}${linked ? ' linked' : ''}`}
                      style={{
                        left: `${(s.start / span) * 100}%`,
                        width: `${((s.end - s.start) / span) * 100}%`,
                        background: colorOf(key),
                      }}
                      onPointerDown={(e) => handleDown(e, s.index, 'move')}
                      onPointerMove={handleMove}
                      onPointerUp={handleUp}
                      onPointerCancel={handleUp}
                    >
                      {!linked && (
                        <span
                          className="tl-resize"
                          onPointerDown={(e) => handleDown(e, s.index, 'resize')}
                          onPointerMove={handleMove}
                          onPointerUp={handleUp}
                          onPointerCancel={handleUp}
                        />
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
        {keys.length === 0 && <p className="tl-empty">Graba movimientos para verlos aquí.</p>}
        <div className="tl-head-wrap">
          <div ref={headRef} className="tl-playhead" style={{ left: `${(elapsed / span) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

export default Timeline

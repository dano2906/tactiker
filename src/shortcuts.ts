import { useEffect, useRef } from 'preact/hooks'

export interface ShortcutDef {
  keys: string
  label: string
  group: 'Reproducción' | 'Grabación' | 'Edición' | 'Vista' | 'General'
}

/** Lista que se muestra en la ayuda de atajos (el manejo real está en `App`). */
export const SHORTCUTS: ShortcutDef[] = [
  { keys: 'Espacio', label: 'Reproducir o pausar', group: 'Reproducción' },
  { keys: '← →', label: 'Paso anterior o siguiente', group: 'Reproducción' },
  { keys: 'P', label: 'Modo presentación', group: 'Reproducción' },
  { keys: 'G', label: 'Grabar o finalizar la grabación', group: 'Grabación' },
  { keys: 'N', label: 'Nuevo paso (grabando)', group: 'Grabación' },
  { keys: 'Ctrl Z', label: 'Deshacer', group: 'Edición' },
  { keys: 'Ctrl Mayús Z', label: 'Rehacer', group: 'Edición' },
  { keys: 'Supr', label: 'Borrar la ficha o el movimiento seleccionado', group: 'Edición' },
  { keys: '1 – 9', label: 'Herramienta: mover, flecha, trazo, curva, zona, elipse, cono, texto, borrar', group: 'Edición' },
  { keys: 'Esc', label: 'Soltar herramienta y selección', group: 'Edición' },
  { keys: '+ −', label: 'Acercar o alejar', group: 'Vista' },
  { keys: '0', label: 'Ver el terreno entero', group: 'Vista' },
  { keys: 'F', label: 'Pantalla completa', group: 'Vista' },
  { keys: 'Ctrl K', label: 'Paleta de comandos', group: 'General' },
  { keys: 'Ctrl S', label: 'Guardar la táctica', group: 'General' },
  { keys: '?', label: 'Ver los atajos', group: 'General' },
]

/** ¿El foco está en algo que usa el teclado por sí mismo (campo de texto, deslizador, diálogo…)? */
export function usesKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    !!target.closest('input, select, textarea, [role="slider"], [role="dialog"], dialog')
  )
}

/**
 * Registra un único manejador global de teclado. El manejador siempre ve la última versión de `App`
 * y devuelve `true` si ha tratado la tecla (entonces se evita la acción por defecto del navegador).
 */
export function useShortcuts(handler: (e: KeyboardEvent) => boolean) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      if (ref.current(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

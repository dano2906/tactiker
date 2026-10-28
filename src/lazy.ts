import { useEffect, useState } from 'preact/hooks'

const loaded = new Map<unknown, unknown>()

/**
 * Carga un módulo con `import()` la primera vez que `enabled` es verdadero y lo conserva. Sirve para que las
 * piezas que no se ven al abrir la app (informe, paleta, plantel…) no engorden la descarga inicial.
 */
export function useLazyModule<T>(load: () => Promise<T>, enabled: boolean): T | null {
  const [mod, setMod] = useState<T | null>((loaded.get(load) as T | undefined) ?? null)
  useEffect(() => {
    if (!enabled || mod) return
    let live = true
    load().then((m) => {
      loaded.set(load, m)
      if (live) setMod(m)
    })
    return () => {
      live = false
    }
  }, [enabled])
  return mod
}

/** Descarga en segundo plano (sin bloquear nada) lo que probablemente se use pronto, para que no haya espera. */
export function prefetchLater(loaders: (() => Promise<unknown>)[], delayMs = 3000) {
  const run = () => loaders.forEach((load) => load().then((m) => loaded.set(load, m)).catch(() => {}))
  if ('requestIdleCallback' in window) setTimeout(() => requestIdleCallback(run), delayMs)
  else setTimeout(run, delayMs)
}

/** Un ejercicio de una sesión de entrenamiento. */
export interface SessionItem {
  id: string
  title: string
  /** Duración prevista, en minutos. */
  minutes: number
  objective: string
  material: string[]
  notes: string
  /** Jugada de la táctica que ilustra el ejercicio (índice), si la hay. */
  scene: number | null
}

export const MATERIALS = ['Conos', 'Balones', 'Petos', 'Porterías', 'Vallas', 'Picas', 'Aros', 'Escaleras']

export const newSessionItem = (n: number, scene: number | null): SessionItem => ({
  id: crypto.randomUUID(),
  title: `Ejercicio ${n}`,
  minutes: 10,
  objective: '',
  material: [],
  notes: '',
  scene,
})

export const totalMinutes = (items: SessionItem[]) => items.reduce((sum, i) => sum + i.minutes, 0)

export function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : ''
  const s = Math.abs(Math.round(totalSeconds))
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Valida una sesión leída de almacenamiento o de un archivo importado. */
export function parseSession(value: unknown): SessionItem[] {
  if (!Array.isArray(value)) return []
  const items: SessionItem[] = []
  for (const raw of value.slice(0, 60)) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const minutes = typeof r.minutes === 'number' && Number.isFinite(r.minutes) ? Math.min(240, Math.max(1, Math.round(r.minutes))) : 10
    items.push({
      id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
      title: typeof r.title === 'string' ? r.title.slice(0, 80) : 'Ejercicio',
      minutes,
      objective: typeof r.objective === 'string' ? r.objective.slice(0, 300) : '',
      material: Array.isArray(r.material) ? r.material.filter((m): m is string => typeof m === 'string').map((m) => m.slice(0, 30)).slice(0, 12) : [],
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 1000) : '',
      scene: typeof r.scene === 'number' && Number.isInteger(r.scene) && r.scene >= 0 ? r.scene : null,
    })
  }
  return items
}

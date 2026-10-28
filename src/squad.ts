import type { Roster } from './roster'

/** Un jugador del plantel del entrenador (se guarda en este dispositivo y se reutiliza en todas las tácticas). */
export interface SquadPlayer {
  id: string
  name: string
  dorsal: number
  /** Posición abreviada (POR, DEF, MED, DEL…). */
  role: string
  /** Foto pequeña en data URL. */
  photo?: string
}

const SQUAD_KEY = 'tactiker.squad'

export function loadSquad(): SquadPlayer[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SQUAD_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map((p) => ({
        id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
        name: typeof p.name === 'string' ? p.name.slice(0, 30) : '',
        dorsal: typeof p.dorsal === 'number' && Number.isFinite(p.dorsal) ? Math.min(99, Math.max(0, Math.round(p.dorsal))) : 0,
        role: typeof p.role === 'string' ? p.role.slice(0, 6) : '',
        ...(typeof p.photo === 'string' && p.photo.startsWith('data:image/') && p.photo.length < 80_000 ? { photo: p.photo } : {}),
      }))
  } catch {
    return []
  }
}

export function saveSquad(list: SquadPlayer[]) {
  try {
    localStorage.setItem(SQUAD_KEY, JSON.stringify(list))
  } catch {
    // sin almacenamiento: el plantel vale para esta sesión
  }
}

/** Datos de ficha que salen de un jugador del plantel. */
export const infoFromPlayer = (player: SquadPlayer) => ({
  squadId: player.id,
  name: player.name,
  dorsal: player.dorsal,
  role: player.role,
  ...(player.photo ? { photo: player.photo } : {}),
})

/**
 * Actualiza las fichas vinculadas al plantel con los datos actuales de cada jugador; si el jugador ya no
 * existe, la ficha conserva sus datos pero pierde el vínculo.
 */
export function syncRoster(roster: Roster, squad: SquadPlayer[]): Roster {
  let changed = false
  const next: Roster = {}
  for (const [key, info] of Object.entries(roster)) {
    if (!info.squadId) {
      next[key] = info
      continue
    }
    const player = squad.find((p) => p.id === info.squadId)
    const { squadId: _gone, photo: _photo, ...rest } = info
    next[key] = player ? { ...rest, ...infoFromPlayer(player) } : rest
    if (JSON.stringify(next[key]) !== JSON.stringify(info)) changed = true
  }
  return changed ? next : roster
}

/** Asigna jugadores a las fichas de un equipo: porteros primero a la ficha 1 y el resto por dorsal. */
export function assignToTeam(roster: Roster, squad: SquadPlayer[], keys: string[]): Roster {
  const slotOf = (key: string) => Number(key.split('-')[1])
  const sortedKeys = [...keys].sort((a, b) => slotOf(a) - slotOf(b))
  const keepers = squad.filter((p) => /^(por|gk|pt)/i.test(p.role))
  const field = squad.filter((p) => !keepers.includes(p)).sort((a, b) => a.dorsal - b.dorsal)
  const order = [...keepers.slice(0, 1), ...field, ...keepers.slice(1)]
  const next = { ...roster }
  sortedKeys.forEach((key, i) => {
    const player = order[i]
    if (player) next[key] = { ...next[key], ...infoFromPlayer(player) }
  })
  return next
}

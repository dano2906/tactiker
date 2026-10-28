import type { TokenLabel } from './draw'
import { getFormation, type Mode, type Teams } from './modes'
import { defaultRole, parseKey, type LabelMode, type Roster } from './roster'

/** Texto, pie y foto de cada ficha, según los datos del jugador y el modo de etiquetas elegido. */
export function buildTokens(
  keys: string[],
  roster: Roster,
  labelMode: LabelMode,
  teams: Teams,
  baseMode: Mode,
): Record<string, TokenLabel> {
  const result: Record<string, TokenLabel> = {}
  for (const key of keys) {
    if (key === 'ball') continue
    const { kind, slot } = parseKey(key)
    const info = roster[key]
    const isTeam = kind === 'left' || kind === 'right'
    const role = info?.role ?? (isTeam ? defaultRole(getFormation(baseMode, teams[kind].formationId), slot) : '')
    result[key] = {
      text: String(info?.dorsal ?? (isTeam ? slot : kind === 'neutral' ? 'C' : 'Á')),
      caption: labelMode === 'name' ? (info?.name ?? '') : labelMode === 'role' ? role : '',
      size: info?.size,
      ...(labelMode === 'photo' && info?.photo ? { photo: info.photo } : {}),
    }
  }
  return result
}

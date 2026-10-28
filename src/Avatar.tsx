import type { SquadPlayer } from './squad'

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

/** Foto del jugador o, sin ella, sus iniciales. */
export function Avatar({ player }: { player: Pick<SquadPlayer, 'name' | 'photo'> }) {
  return player.photo ? (
    <img className="avatar" src={player.photo} alt="" />
  ) : (
    <span className="avatar" aria-hidden="true">{initials(player.name)}</span>
  )
}

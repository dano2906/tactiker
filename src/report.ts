import { computeControl, type Control } from './control'
import { getFormation, lineKeys, type Mode, type Teams } from './modes'
import { passNetwork, type PassNetwork } from './passes'
import { movementStats, positionsAt, totalDuration, groupSteps, type Movement, type Positions } from './recording'
import { parseKey, type Roster } from './roster'
import { buildTokens } from './tokens'

export interface PlayerRow {
  key: string
  label: string
  team: string
  movements: number
  meters: number
  avgKmh: number
  maxKmh: number
}

export interface Report {
  name: string
  modeLabel: string
  size: string
  /** Duración de la reproducción, en segundos. */
  seconds: number
  steps: number
  players: PlayerRow[]
  ball: PlayerRow | null
  network: PassNetwork
  controlStart: Control
  controlEnd: Control
  /** Distancia en profundidad (m) entre líneas consecutivas de cada equipo, al principio y al final. */
  depths: { team: string; start: number[]; end: number[] }[]
  notes: string
  stepNotes: { step: number; text: string }[]
  /** Etiqueta de cada ficha, para escribir el informe. */
  labels: Record<string, string>
}

interface Input {
  name: string
  baseMode: Mode
  mode: Mode
  teams: Teams
  roster: Roster
  start: Positions
  movements: Movement[]
  startCarrier: string | null
  notes: string
  stepNotes: Record<string, string>
}

const TEAM_NAMES = { left: 'Rojo', right: 'Azul', neutral: 'Comodín', ref: 'Árbitro', ball: 'Balón' } as const

const round1 = (n: number) => Math.round(n * 10) / 10

/** Resumen de una jugada: recorridos y velocidades, pases, espacio controlado y distancias entre líneas. */
export function buildReport(input: Input): Report {
  const { baseMode, mode, teams, roster, start, movements } = input
  const total = totalDuration(movements)
  const tokens = buildTokens(Object.keys(start), roster, 'none', teams, baseMode)
  const labels: Record<string, string> = {}
  for (const key of Object.keys(start)) {
    const { kind } = parseKey(key)
    labels[key] = key === 'ball' ? 'Balón' : `${tokens[key]?.text ?? ''} ${roster[key]?.name?.trim() || TEAM_NAMES[kind]}`.trim()
  }

  const rows = new Map<string, PlayerRow>()
  for (const key of Object.keys(start)) {
    const { kind } = parseKey(key)
    rows.set(key, { key, label: labels[key], team: TEAM_NAMES[kind], movements: 0, meters: 0, avgKmh: 0, maxKmh: 0 })
  }
  const seconds = new Map<string, number>()
  for (const m of movements) {
    const row = rows.get(m.key)
    if (!row) continue
    const stats = movementStats(m, mode)
    row.movements++
    row.meters += stats.distance
    row.maxKmh = Math.max(row.maxKmh, stats.speedKmh)
    seconds.set(m.key, (seconds.get(m.key) ?? 0) + stats.seconds)
  }
  for (const row of rows.values()) {
    const s = seconds.get(row.key)
    row.avgKmh = s ? (row.meters / s) * 3.6 : 0
    row.meters = round1(row.meters)
    row.avgKmh = round1(row.avgKmh)
    row.maxKmh = round1(row.maxKmh)
  }
  const players = [...rows.values()].filter((r) => r.key !== 'ball' && r.movements > 0).sort((a, b) => b.meters - a.meters)

  const end = positionsAt(start, movements, total)
  const depthsOf = (positions: Positions, side: 'left' | 'right') => {
    const lines = lineKeys(getFormation(baseMode, teams[side].formationId), side)
      .map((keys) => keys.filter((k) => k in positions))
      .filter((keys) => keys.length > 0)
    const centers = lines.map((keys) => keys.reduce((sum, k) => sum + positions[k].x, 0) / keys.length)
    return centers.slice(1).map((x, i) => round1(Math.abs(x - centers[i]) * mode.length))
  }
  const depths = (['left', 'right'] as const)
    .filter((side) => teams[side].visible)
    .map((side) => ({ team: TEAM_NAMES[side], start: depthsOf(start, side), end: depthsOf(end, side) }))

  return {
    name: input.name,
    modeLabel: baseMode.label,
    size: `${mode.length} × ${mode.width} m`,
    seconds: round1(total / 1000),
    steps: groupSteps(movements).length,
    players,
    ball: rows.get('ball')?.movements ? rows.get('ball')! : null,
    network: passNetwork(start, movements, input.startCarrier),
    controlStart: computeControl(start, mode),
    controlEnd: computeControl(end, mode),
    depths,
    notes: input.notes,
    stepNotes: Object.entries(input.stepNotes)
      .map(([step, text]) => ({ step: Number(step) + 1, text }))
      .sort((a, b) => a.step - b.step),
    labels,
  }
}

const pct = (n: number) => `${Math.round(n * 100)} %`
const num = (n: number) => String(n).replace('.', ',')

export function reportToText(r: Report): string {
  const lines = [
    `Informe de la jugada: ${r.name}`,
    `${r.modeLabel} · ${r.size} · ${num(r.seconds)} s · ${r.steps} paso${r.steps === 1 ? '' : 's'}`,
    '',
    `Espacio controlado (inicio → final): Rojo ${pct(r.controlStart.left)} → ${pct(r.controlEnd.left)} · Azul ${pct(r.controlStart.right)} → ${pct(r.controlEnd.right)}`,
  ]
  for (const d of r.depths) {
    lines.push(`Distancia entre líneas ${d.team} (m): ${d.start.map(num).join(' · ') || '—'} → ${d.end.map(num).join(' · ') || '—'}`)
  }
  lines.push('', `Pases: ${r.network.total}`)
  for (const e of r.network.edges) lines.push(`  ${r.labels[e.from]} → ${r.labels[e.to]}: ${e.count}`)
  lines.push('', 'Jugador · movimientos · metros · velocidad media · velocidad máxima (km/h)')
  for (const p of r.players) lines.push(`  ${p.label} · ${p.movements} · ${num(p.meters)} · ${num(p.avgKmh)} · ${num(p.maxKmh)}`)
  if (r.ball) lines.push(`  Balón · ${r.ball.movements} · ${num(r.ball.meters)} · ${num(r.ball.avgKmh)} · ${num(r.ball.maxKmh)}`)
  if (r.notes) lines.push('', `Notas: ${r.notes}`)
  for (const n of r.stepNotes) lines.push(`  Paso ${n.step}: ${n.text}`)
  return lines.join('\n')
}

const csvCell = (value: string | number) => {
  const text = String(value)
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV de los jugadores (con punto y coma, para que lo abra Excel en español). */
export function reportToCsv(r: Report): string {
  const rows = [['Ficha', 'Equipo', 'Movimientos', 'Metros', 'Velocidad media km/h', 'Velocidad máxima km/h']]
  for (const p of [...r.players, ...(r.ball ? [r.ball] : [])]) {
    rows.push([p.label, p.team, String(p.movements), num(p.meters), num(p.avgKmh), num(p.maxKmh)])
  }
  return '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\n')
}

import { parseTactic, type Tactic } from './storage'

const SESSION_KEY = 'tactiker.session'

/** Guarda la táctica en curso para recuperarla al volver a abrir la app. */
/** Táctica en curso y jugada que estaba abierta. */
export interface Session {
  tactic: Tactic
  active: number
}

export function saveSession(tactic: Tactic, active: number): boolean {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...tactic, active }))
    return true
  } catch {
    // Almacenamiento lleno (p. ej. por una imagen de fondo grande): se sigue sin autoguardado.
    return false
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const json = JSON.parse(raw)
    const tactic = parseTactic(json)
    if (!tactic) return null
    const active = Number.isInteger(json.active) ? Math.min(Math.max(0, json.active), tactic.scenes.length - 1) : 0
    return { tactic, active }
  } catch {
    return null
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // sin almacenamiento
  }
}

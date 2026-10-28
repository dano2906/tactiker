import { parseTactic, type Tactic } from './storage'

/** Parámetro de la URL que lleva la táctica compartida: `#t=<código>`. */
export const SHARE_PARAM = 't'

/** Tamaño máximo (bytes) de una táctica descomprimida, para no abrir enlaces maliciosos. */
const MAX_BYTES = 4_000_000
/** A partir de esta longitud algunas apps de mensajería cortan los enlaces. */
export const LONG_LINK = 8000

const toBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new Error('demasiado grande')
    }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/** Redondea los números para acortar el enlace (el tiempo, a milisegundos; las posiciones, a 4 decimales). */
const slim = (key: string, value: unknown) =>
  key === 'background' || key === 'photo' ? undefined : typeof value === 'number' ? (key === 't' ? Math.round(value) : Math.round(value * 10000) / 10000) : value

/** Convierte una táctica en un texto apto para una URL: JSON comprimido y en base64. */
export async function encodeTactic(tactic: Tactic): Promise<string> {
  const { name, scenes, session } = tactic
  const bytes = new TextEncoder().encode(JSON.stringify({ name, scenes, session }, slim))
  if (typeof CompressionStream === 'undefined') return `j.${toBase64Url(bytes)}`
  return `z.${toBase64Url(await transform(bytes, new CompressionStream('deflate-raw')))}`
}

/** Lo contrario de `encodeTactic`; valida el contenido y devuelve `null` si no es una táctica válida. */
export async function decodeTactic(code: string): Promise<Tactic | null> {
  try {
    const bytes = fromBase64Url(code.slice(2))
    const raw =
      code.startsWith('z.')
        ? await transform(bytes, new DecompressionStream('deflate-raw'))
        : code.startsWith('j.')
          ? bytes
          : null
    if (!raw || raw.length > MAX_BYTES) return null
    const tactic = parseTactic(JSON.parse(new TextDecoder().decode(raw)))
    return tactic && { ...tactic, id: crypto.randomUUID() }
  } catch {
    return null
  }
}

export const shareUrl = (code: string) =>
  `${location.origin}${location.pathname}#${SHARE_PARAM}=${code}`

/** Código de la táctica si la URL actual es un enlace compartido. */
export function codeFromLocation(): string | null {
  const match = new RegExp(`^#${SHARE_PARAM}=(.+)$`).exec(location.hash)
  return match ? match[1] : null
}

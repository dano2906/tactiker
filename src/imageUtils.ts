/**
 * Reduce una imagen subida por el usuario y la devuelve como data URL JPEG, para guardarla junto a la táctica
 * (fondos del terreno) o en el plantel (fotos). Con `square` recorta el centro en cuadrado.
 */
export async function downscaleImage(
  file: File,
  maxSide: number,
  options: { square?: boolean; quality?: number } = {},
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.')
  if (file.size > 25_000_000) throw new Error('La imagen pesa demasiado (máximo 25 MB).')
  const bitmap = await createImageBitmap(file)
  try {
    let sw = bitmap.width
    let sh = bitmap.height
    let sx = 0
    let sy = 0
    if (options.square) {
      const side = Math.min(sw, sh)
      sx = (sw - side) / 2
      sy = (sh - side) / 2
      sw = sh = side
    }
    const scale = Math.min(1, maxSide / Math.max(sw, sh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw * scale))
    canvas.height = Math.max(1, Math.round(sh * scale))
    canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', options.quality ?? 0.8)
  } finally {
    bitmap.close()
  }
}

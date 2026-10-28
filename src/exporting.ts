export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadPng(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => blob && downloadBlob(blob, `${name}.png`), 'image/png')
}

/** Formato de vídeo soportado por el navegador (mp4 en Safari, webm en el resto). */
export function pickVideoMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const options = [
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4', ext: 'mp4' },
  ]
  return options.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? null
}

/** Nombre de archivo seguro: sin acentos ni caracteres raros. */
export const safeName = (name: string) =>
  name.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w-]+/g, '_') || 'tactica'

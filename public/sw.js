// Service worker de Tactiker: la app funciona sin conexión tras la primera visita.
// - Navegación: red primero (para recoger versiones nuevas) y, sin red, la última página guardada.
// - /assets/: archivos con hash en el nombre, no cambian nunca -> caché primero.
// - Resto de archivos estáticos: sirve lo guardado y lo actualiza en segundo plano.
const CACHE = 'tactiker-v3'
const SHELL = ['/fonts/outfit-400-700.woff2', '/fonts/barlow-condensed-600.woff2', '/fonts/barlow-condensed-700.woff2', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png']

/**
 * Los archivos JS cargan otros bajo demanda (`import('./Informe-abc123.js')`): se leen para guardar también
 * esos, de modo que cualquier función funcione sin conexión desde la primera visita.
 */
async function withChunks(urls) {
  const found = new Set(urls)
  const queue = urls.filter((u) => u.endsWith('.js'))
  while (queue.length && found.size < 60) {
    const url = queue.shift()
    try {
      const code = await (await fetch(url)).text()
      for (const [, name] of code.matchAll(/["'`]\.\/([A-Za-z0-9_.-]+\.js)["'`]/g)) {
        const next = `/assets/${name}`
        if (!found.has(next)) {
          found.add(next)
          queue.push(next)
        }
      }
    } catch {
      // un archivo que no se pueda leer no impide instalar el resto
    }
  }
  return [...found]
}

const assetUrls = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])

/** Borra de la caché los archivos de /assets/ que la página actual ya no usa. */
async function prune(html) {
  const keep = new Set(assetUrls(html))
  const cache = await caches.open(CACHE)
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/assets/') && !keep.has(pathname)) await cache.delete(request)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const page = await fetch('/', { cache: 'reload' })
      const html = await page.clone().text()
      await cache.put('/', page)
      // Un archivo que falle no debe impedir instalar el resto.
      const assets = await withChunks(assetUrls(html))
      await Promise.all([...SHELL, ...assets].map((url) => cache.add(url).catch(() => {})))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const fresh = await fetch(request)
          if (fresh.ok) {
            await cache.put('/', fresh.clone())
            event.waitUntil(fresh.clone().text().then(prune))
          }
          return fresh
        } catch {
          return (await cache.match('/', { ignoreVary: true })) ?? Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request, { ignoreVary: true })
      if (url.pathname.startsWith('/assets/') && cached) return cached
      const update = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone())
          return res
        })
        .catch(() => undefined)
      if (cached) {
        event.waitUntil(update)
        return cached
      }
      return (await update) ?? Response.error()
    })(),
  )
})

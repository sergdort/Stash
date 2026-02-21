const CACHE_NAME = "stash-web-shell-v1"
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Let media requests bypass service worker handling to avoid playback issues on some browsers.
  if (url.pathname.startsWith("/api/audio/")) {
    return
  }

  // Network-first for API
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ ok: false, error: { code: "OFFLINE", message: "Offline" } }), {
            status: 503,
            headers: { "content-type": "application/json" },
          }),
      ),
    )
    return
  }

  // App shell/navigation: cache-first fallback to index
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/").then((r) => r || Response.error())))
    return
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
          }
          return response
        })
        .catch(() => cached)

      return cached || networkFetch
    }),
  )
})

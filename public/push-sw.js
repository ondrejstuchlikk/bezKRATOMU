// Push handling, loaded into the generated service worker (see workbox.importScripts in vite.config.ts).
// Payload: { title, body, url, tag } from supabase/functions/push.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'bezKRATOMU', {
      body: data.body || '',
      tag: data.tag,
      icon: 'pwa-192x192.png',
      badge: 'pwa-64x64.png',
      data: { url: data.url || './' },
    }),
  )
})

// Opens the app (or focuses it) on the page the notification is about.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w)
      if (!open) return self.clients.openWindow(url)
      return open
        .navigate(url)
        .then((c) => (c ?? open).focus())
        .catch(() => self.clients.openWindow(url))
    }),
  )
})

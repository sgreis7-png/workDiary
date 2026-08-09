// Web-push handlers, imported into the generated service worker (workbox importScripts).

// A push payload is composed by whoever sent it. clients.openWindow() will happily open
// another site, so a notification that looks like it came from the system could carry the
// user anywhere. Resolve the link and keep it on this origin.
//
// Deliberately just an origin check, with no route allowlist: the app has one
// (src/lib/safeLink.ts) and duplicating it here would drift. Origin is the part that
// matters outside the app.
function sameOriginPath(link) {
  try {
    const url = new URL(String(link ?? '/'), self.location.origin)
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/'
  } catch {
    return '/'
  }
}
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'Agrotop', body: event.data?.text() ?? '' } }
  const title = data.title || 'יומן עבודה · Agrotop'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    dir: 'rtl',
    lang: 'he',
    data: { link: sameOriginPath(data.link) },
    tag: data.tag || undefined,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = sameOriginPath(event.notification.data?.link)
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(link); return }
    }
    await self.clients.openWindow(link)
  })())
})

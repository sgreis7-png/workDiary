// Web-push handlers, imported into the generated service worker (workbox importScripts).
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
    data: { link: data.link || '/' },
    tag: data.tag || undefined,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification.data?.link || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(link); return }
    }
    await self.clients.openWindow(link)
  })())
})

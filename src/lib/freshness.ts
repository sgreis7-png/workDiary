// Self-heal for stuck service workers: on launch, compare the running bundle
// with the server's index.html. If the server references a different bundle,
// unregister the SW, wipe caches, and reload once. Guarded per-session so a
// broken network answer can't cause a reload loop.
export function ensureFresh(): void {
  if (sessionStorage.getItem('wd-fresh-tried')) return
  setTimeout(async () => {
    try {
      const res = await fetch('/index.html', { cache: 'no-store' })
      if (!res.ok) return
      const html = await res.text()
      const server = html.match(/assets\/index-[\w-]+\.js/)?.[0]
      if (!server) return
      const mine = Array.from(document.scripts).some((s) => s.src.includes(server))
      if (mine) return
      // stale: nuke SW + caches, reload once
      sessionStorage.setItem('wd-fresh-tried', '1')
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? []
      await Promise.all(regs.map((r) => r.unregister()))
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      location.reload()
    } catch { /* offline — never break startup */ }
  }, 2500)
}

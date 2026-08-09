// Notification links are attacker-controlled.
//
// Any active member can insert a notifications row, or call send-push, with a link of
// their choosing, and the bell handed that string straight to navigate(). '//evil.com' is
// a protocol-relative URL: the browser leaves the origin entirely, on a click inside a
// trusted internal app, from a message that looks like it came from the system. Combined
// with a plausible title that is a workable phishing page.
//
// So a link is only followed if it is a path this application actually serves. Anything
// else falls back to the notifications screen rather than being dropped silently, because
// a notification that does nothing when tapped reads as a broken app.

/** Route prefixes the app serves. Kept in step with the routes in src/App.tsx. */
const ROUTES = [
  '/', '/new', '/edit', '/entry', '/search', '/calendar', '/dashboard', '/digest',
  '/projects', '/control', '/gantt', '/export', '/tasks', '/messages', '/lists',
  '/alert-rules', '/account', '/report', '/defects', '/admin',
]

export const FALLBACK_LINK = '/messages'

/**
 * A same-origin application path, or null.
 *
 * Rejects anything with a scheme, anything protocol-relative, anything with a backslash
 * (which some browsers normalize to a forward slash), and any path the app does not serve.
 */
export function safeInternalPath(link: string | null | undefined): string | null {
  if (!link) return null
  const raw = link.trim()
  if (!raw.startsWith('/')) return null          // relative, scheme-bearing, or mailto:
  if (raw.startsWith('//')) return null          // protocol-relative → off-origin
  if (raw.includes('\\')) return null            // normalized to '/' by some browsers
  // Control characters and whitespace. Checked by code point rather than with a regex:
  // a character class containing them trips no-control-regex, and the rule is right
  // that they are usually accidental — here they are deliberate.
  for (const ch of raw) {
    const code = ch.codePointAt(0) as number
    if (code < 0x20 || code === 0x7f) return null
  }
  if (/\s/.test(raw)) return null

  // Resolve against a throwaway origin so traversal and encoding are normalized for us,
  // then confirm nothing escaped and the result is a route we recognise.
  let url: URL
  try {
    url = new URL(raw, 'https://internal.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'https://internal.invalid') return null

  const path = url.pathname
  const known = ROUTES.some((r) => (r === '/' ? path === '/' : path === r || path.startsWith(`${r}/`)))
  if (!known) return null

  return path + url.search + url.hash
}

/** The path to navigate to for a notification, never leaving the app. */
export function notificationTarget(link: string | null | undefined): string {
  return safeInternalPath(link) ?? FALLBACK_LINK
}

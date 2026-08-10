import { describe, expect, it } from 'vitest'
import { FALLBACK_LINK, notificationTarget, safeInternalPath } from './safeLink'

describe('safeInternalPath', () => {
  it('accepts the paths notifications actually use', () => {
    for (const path of [
      '/', '/messages', '/tasks', '/defects', '/defects/coop/abc-123',
      '/entry/9f0e', '/control?project=abc', '/export', '/admin/users',
      '/gantt', '/digest#top', '/alert-rules', '/entry/a%20b',
    ]) {
      expect(safeInternalPath(path), path).toBe(path)
    }
  })

  it('refuses to leave the origin', () => {
    // the finding: '//evil.com' is protocol-relative, so the browser leaves the site
    for (const link of [
      '//evil.com', '//evil.com/messages', 'https://evil.com', 'http://evil.com/x',
      '\\\\evil.com', '/\\evil.com', 'javascript:alert(1)', 'data:text/html,<h1>x',
      'mailto:a@b.c', '   //evil.com',
    ]) {
      expect(safeInternalPath(link), link).toBeNull()
    }
  })

  it('refuses paths the app does not serve', () => {
    for (const link of ['/wp-login.php', '/api/internal', '/messagesXX', '/../etc/passwd']) {
      expect(safeInternalPath(link), link).toBeNull()
    }
  })

  it('refuses empty and control-character input', () => {
    expect(safeInternalPath(null)).toBeNull()
    expect(safeInternalPath('')).toBeNull()
    expect(safeInternalPath('   ')).toBeNull()
    expect(safeInternalPath('/messages\nSet-Cookie: x')).toBeNull()
  })

  it('normalizes traversal that stays inside a known route', () => {
    expect(safeInternalPath('/defects/../messages')).toBe('/messages')
  })
})

describe('notificationTarget', () => {
  it('passes a good link through', () => {
    expect(notificationTarget('/defects/coop/1')).toBe('/defects/coop/1')
  })

  it('sends a hostile or unknown link to the notifications screen rather than nowhere', () => {
    // dropping it silently would read as a broken app
    expect(notificationTarget('//evil.com')).toBe(FALLBACK_LINK)
    expect(notificationTarget('/nope')).toBe(FALLBACK_LINK)
    expect(notificationTarget(null)).toBe(FALLBACK_LINK)
  })
})

// Deep links from the alert notifications. These carry a query string, and the whole point of the
// alert is that pressing it lands on the thing that is late or waiting — so if the validator ever
// strips the query, the notification still "works" while opening the wrong project or the wrong
// gate, which is worse than failing outright.
describe('alert deep links', () => {
  const COOP = '404db974-64ed-4bf5-80e1-7ec8a11cf07a'
  const PROJ = 'a72117c1-0ecc-47dd-994d-6357ab86d696'

  it('keeps the project on a schedule-overrun link', () => {
    expect(safeInternalPath(`/gantt?project=${PROJ}`)).toBe(`/gantt?project=${PROJ}`)
  })

  it('keeps the gate on an awaiting-approval link', () => {
    expect(safeInternalPath(`/defects/coop/${COOP}?gate=gate1`))
      .toBe(`/defects/coop/${COOP}?gate=gate1`)
  })

  it('still refuses an off-origin link that carries a plausible query', () => {
    expect(safeInternalPath(`//evil.example/gantt?project=${PROJ}`)).toBeNull()
    expect(safeInternalPath(`https://evil.example/gantt?project=${PROJ}`)).toBeNull()
  })
})

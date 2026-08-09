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

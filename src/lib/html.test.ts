// escapeHtml is the only thing between a field value and injection into a
// recipient's mail client. It used to exist as two private copies, only one of
// which had a test — this covers the shared one both builders now use.
import { describe, it, expect } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('neutralises a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  it('escapes both quote styles so attribute context stays safe', () => {
    expect(escapeHtml('" onerror="x')).toBe('&quot; onerror=&quot;x')
    expect(escapeHtml("' onerror='x")).toBe('&#39; onerror=&#39;x')
  })
  it('escapes ampersands without double-escaping the output', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })
  it('passes Hebrew and punctuation through untouched', () => {
    expect(escapeHtml('לול 3 — 80% הושלם')).toBe('לול 3 — 80% הושלם')
  })
  it('renders null and undefined as an empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

import { describe, it, expect } from 'vitest'
import { parseRecipients, isPopupBlocked } from './outlookSend'

describe('parseRecipients', () => {
  it('splits on commas, semicolons and whitespace', () => {
    expect(parseRecipients('a@x.co.il, b@x.co.il; c@x.co.il\nd@x.co.il'))
      .toEqual(['a@x.co.il', 'b@x.co.il', 'c@x.co.il', 'd@x.co.il'])
  })
  it('lowercases and de-duplicates', () => {
    expect(parseRecipients('Alon@Agrotop.co.il, alon@agrotop.co.il')).toEqual(['alon@agrotop.co.il'])
  })
  it('drops fragments that are not addresses', () => {
    expect(parseRecipients('not-an-email, also@bad, ok@x.co.il')).toEqual(['ok@x.co.il'])
  })
  it('returns an empty list for blank input', () => {
    expect(parseRecipients('   ')).toEqual([])
    expect(parseRecipients('')).toEqual([])
  })
})

describe('isPopupBlocked', () => {
  it('recognises the MSAL popup-blocked error code', () => {
    expect(isPopupBlocked({ errorCode: 'popup_window_error' })).toBe(true)
  })
  it('ignores unrelated failures', () => {
    expect(isPopupBlocked({ errorCode: 'user_cancelled' })).toBe(false)
    expect(isPopupBlocked(new Error('network'))).toBe(false)
    expect(isPopupBlocked(null)).toBe(false)
    expect(isPopupBlocked(undefined)).toBe(false)
  })
})

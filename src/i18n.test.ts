// The dictionaries are the app's only source of user-facing text; a key that is
// present in one language but not the other ships as `undefined` on screen.
import { describe, it, expect } from 'vitest'
import { STRINGS, translate } from './i18n'
import { D, dt } from './defects/i18n'

const dicts: [string, Record<string, { he: string; en: string }>][] = [
  ['i18n.tsx', STRINGS as Record<string, { he: string; en: string }>],
  ['defects/i18n.ts', D as Record<string, { he: string; en: string }>],
]

describe.each(dicts)('%s dictionary', (_name, dict) => {
  it('has a non-empty Hebrew and English string for every key', () => {
    const broken = Object.entries(dict)
      .filter(([, v]) => !v?.he?.trim() || !v?.en?.trim())
      .map(([k]) => k)
    expect(broken).toEqual([])
  })

  it('has no Hebrew characters left inside English values', () => {
    const untranslated = Object.entries(dict)
      .filter(([, v]) => /[֐-׿]/.test(v.en))
      .map(([k]) => k)
    expect(untranslated).toEqual([])
  })
})

// t() receives dynamic keys (edge-function error codes) via `as never`. It used
// to index blindly, so an unmapped code threw — inside a catch handler, which
// swallowed the real failure and showed the user nothing.
// translate() is the exact function the provider hands to screens as t().
describe('translate', () => {
  const unknown = 'some_unmapped_server_code' as never

  it('returns the key instead of throwing on an unmapped code', () => {
    expect(() => translate('he', unknown)).not.toThrow()
    expect(translate('he', unknown)).toBe('some_unmapped_server_code')
  })
  it('resolves real keys in both languages', () => {
    expect(translate('he', 'cancel')).toBe(STRINGS.cancel.he)
    expect(translate('en', 'cancel')).toBe(STRINGS.cancel.en)
  })
  it('defects dt() resolves its own keys', () => {
    expect(dt('he', 'rep_back')).toBe(D.rep_back.he)
    expect(dt('en', 'rep_back')).toBe(D.rep_back.en)
  })
})

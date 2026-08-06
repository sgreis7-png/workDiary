// The dictionaries are the app's only source of user-facing text; a key that is
// present in one language but not the other ships as `undefined` on screen.
import { describe, it, expect } from 'vitest'
import { STRINGS } from './i18n'
import { D } from './defects/i18n'

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

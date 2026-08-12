import { describe, it, expect } from 'vitest'
import {
  COOPS_KEY, DEFAULT_TASKS, HOUSE_PCT_KEY, PROGRESS_KEY,
  bdActive, computedPct, defaultCoop, defaultProgressRows, filledMissing, parseCoops, parseMissing, parseProgress, reasonLabel,
} from './reportTables'

describe('parseProgress', () => {
  it('seeds the default task list when the key is absent', () => {
    const rows = parseProgress(undefined, 'he')
    expect(rows).toHaveLength(DEFAULT_TASKS.length)
    expect(rows[0]).toEqual({ task: DEFAULT_TASKS[0].he, pct: 0, remarks: '' })
    expect(parseProgress(undefined, 'en')[1].task).toBe('Concrete beams finish')
  })
  it('keeps an explicitly emptied table empty', () => {
    expect(parseProgress('[]', 'he')).toEqual([])
  })
  it('round-trips serialized rows', () => {
    const rows = [{ task: 'System', pct: 80, remarks: 'ok' }]
    expect(parseProgress(JSON.stringify(rows), 'en')).toEqual(rows)
  })
  it('clamps pct to 0-100 and survives garbage', () => {
    expect(parseProgress(JSON.stringify([{ task: 'x', pct: 250 }]), 'en')[0].pct).toBe(100)
    expect(parseProgress(JSON.stringify([{ task: 'x', pct: -5 }]), 'en')[0].pct).toBe(0)
    expect(parseProgress('not json', 'en')).toHaveLength(DEFAULT_TASKS.length) // falls back to defaults
  })
})

describe('parseCoops', () => {
  it('returns [] when the entry has no progress data at all', () => {
    expect(parseCoops({}, 'he')).toEqual([])
  })
  it('round-trips the per-coop format; totals derive from the tasks, not the stored number', () => {
    const coops = [
      // stored pct 75 is a hand-typed relic — the tasks say (100+40)/2 = 70
      { name: 'לול 1', pct: 75, rows: [{ task: 'כיסוי גג', pct: 100, remarks: '' }], bd: [{ task: 'מערכת', pct: 40, remarks: '' }] },
      { name: 'לול 2', pct: 25, rows: [], bd: [] }, // no tasks at all → stored pct survives
    ]
    expect(parseCoops({ [COOPS_KEY]: JSON.stringify(coops) }, 'he')).toEqual([
      { ...coops[0], pct: 70 },
      coops[1],
    ])
  })
  it('falls back to legacy flat keys as a single coop', () => {
    const legacy = {
      [PROGRESS_KEY]: JSON.stringify([{ task: 'System', pct: 80, remarks: '' }]),
      [HOUSE_PCT_KEY]: '70',
    }
    // standard task names are normalized to the requested language ('System' → 'מערכת')
    expect(parseCoops(legacy, 'he')).toEqual([
      { name: 'לול 1', pct: 70, rows: [{ task: 'מערכת', pct: 80, remarks: '' }], bd: [] },
    ])
  })
  it('names unnamed coops by position and clamps pct', () => {
    const raw = JSON.stringify([{ pct: 999, rows: 'garbage' }, { name: '', pct: -3 }])
    expect(parseCoops({ [COOPS_KEY]: raw }, 'en')).toEqual([
      { name: 'Coop 1', pct: 100, rows: [], bd: [] },
      { name: 'Coop 2', pct: 0, rows: [], bd: [] },
    ])
  })
  it('seeds a default coop with the standard task list and the BD sub-form', () => {
    const c = defaultCoop('he')
    expect(c.name).toBe('לול 1')
    expect(c.pct).toBe(0)
    expect(c.rows).toEqual(defaultProgressRows('he'))
    expect(c.bd.map((r) => r.task)).toContain('מסועי זבל')
    expect(bdActive(c.bd)).toBe(false)
    expect(bdActive([{ task: 'מערכת', pct: 10, remarks: '' }])).toBe(true)
  })
})

describe('computedPct', () => {
  const r = (pct: number) => ({ task: 'x', pct, remarks: '' })
  it('averages the construction tasks', () => {
    expect(computedPct([r(100), r(0)], [])).toBe(50)
    expect(computedPct([r(100), r(100), r(100), r(100), r(0), r(5), r(0), r(10), r(0)], [])).toBe(46)
  })
  it('ignores an untouched all-zero BD table but counts a started one', () => {
    expect(computedPct([r(100)], [r(0), r(0)])).toBe(100)
    expect(computedPct([r(100)], [r(40)])).toBe(70)
    expect(computedPct([r(100)], [{ task: 'x', pct: 0, remarks: 'הוזמן' }, r(0)])).toBe(33)
  })
  it('is 0 when nothing was entered', () => {
    expect(computedPct([], [])).toBe(0)
  })
})

describe('parseMissing / filledMissing', () => {
  it('is empty by default and survives garbage', () => {
    expect(parseMissing(undefined)).toEqual([])
    expect(parseMissing('oops')).toEqual([])
  })
  it('round-trips rows and filters untouched ones', () => {
    const rows = [
      { code: '', desc: '', amount: '', reason: '' },       // untouched → dropped
      { code: '123', desc: 'motor', amount: '2', reason: '4' },
      { code: '', desc: '', amount: '', reason: '1' },      // reason only → kept
    ]
    const parsed = parseMissing(JSON.stringify(rows))
    expect(parsed).toEqual(rows)
    expect(filledMissing(parsed)).toEqual([rows[1], rows[2]])
  })
})

describe('reasonLabel', () => {
  it('maps ids per language, empty for unknown', () => {
    expect(reasonLabel('1', 'en')).toBe('Damaged on site')
    expect(reasonLabel('4', 'he')).toBe('לא סופק מספיק')
    expect(reasonLabel('9', 'he')).toBe('')
  })
})

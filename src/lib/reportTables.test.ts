import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TASKS, defaultProgressRows, filledMissing, parseMissing, parseProgress, reasonLabel,
} from './reportTables'

describe('parseProgress', () => {
  it('seeds the default task list when the key is absent', () => {
    const rows = parseProgress(undefined, 'he')
    expect(rows).toHaveLength(DEFAULT_TASKS.length)
    expect(rows[0]).toEqual({ task: DEFAULT_TASKS[0].he, pct: 0, remarks: '' })
    expect(parseProgress(undefined, 'en')[1].task).toBe('System')
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

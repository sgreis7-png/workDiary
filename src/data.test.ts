import { describe, expect, it } from 'vitest'
import { colorForIndex, entryMatchesText, groupByDate, PROJECT_COLORS } from './data'

describe('colorForIndex', () => {
  it('maps each index to its palette color', () => {
    expect(colorForIndex(0)).toBe(PROJECT_COLORS[0])
    expect(colorForIndex(2)).toBe(PROJECT_COLORS[2])
  })
  it('wraps around the palette', () => {
    expect(colorForIndex(PROJECT_COLORS.length)).toBe(PROJECT_COLORS[0])
    expect(colorForIndex(PROJECT_COLORS.length + 1)).toBe(PROJECT_COLORS[1])
  })
  it('treats a missing index (-1) as the first color', () => {
    expect(colorForIndex(-1)).toBe(PROJECT_COLORS[0])
  })
})

describe('entryMatchesText', () => {
  const values = { site_location: 'כפר יובל', contractor: 'חמודה — 5 פועלים', weather: 'שמש' }
  it('returns true for empty query', () => {
    expect(entryMatchesText(values, '')).toBe(true)
  })
  it('matches across any field, case-insensitively', () => {
    expect(entryMatchesText(values, 'יובל')).toBe(true)
    expect(entryMatchesText({ a: 'Hello World' }, 'hello')).toBe(true)
  })
  it('returns false when nothing contains the query', () => {
    expect(entryMatchesText(values, 'דצמן')).toBe(false)
  })
})

describe('groupByDate', () => {
  it('buckets items by their work_date', () => {
    const items = [
      { work_date: '2026-06-29', id: 'a' },
      { work_date: '2026-06-29', id: 'b' },
      { work_date: '2026-06-28', id: 'c' },
    ]
    const grouped = groupByDate(items)
    expect(Object.keys(grouped).sort()).toEqual(['2026-06-28', '2026-06-29'])
    expect(grouped['2026-06-29'].map((x) => x.id)).toEqual(['a', 'b'])
    expect(grouped['2026-06-28']).toHaveLength(1)
  })
  it('returns an empty object for no items', () => {
    expect(groupByDate([])).toEqual({})
  })
})

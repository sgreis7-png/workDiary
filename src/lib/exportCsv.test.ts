// The CSV feeds Hebrew Excel: quoting mistakes shift whole columns, and a
// missing BOM turns every Hebrew cell into mojibake.
import { describe, it, expect } from 'vitest'
import { toCsv } from './exportCsv'

describe('toCsv', () => {
  it('quotes cells containing commas, quotes and newlines', () => {
    expect(toCsv(['a'], [['x,y'], ['say "hi"'], ['two\nlines']]))
      .toBe('a\r\n"x,y"\r\n"say ""hi"""\r\n"two\nlines"')
  })
  it('leaves plain Hebrew untouched', () => {
    expect(toCsv(['שם'], [['לול 3 — 80%']])).toBe('שם\r\nלול 3 — 80%')
  })
  it('renders null/undefined as empty cells and keeps numbers', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 7]])).toBe('a,b,c\r\n,,7')
  })
})

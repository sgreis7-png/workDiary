import { describe, expect, it } from 'vitest'
import { filledCrew, parseArrived, parseCrew, spanHours } from './crewRows'

const row = (contractor: string, workers = 0) => ({ contractor, workers, hours: 8, from: '07:00', to: '15:00' })

describe('crew rows', () => {
  it('parses stored JSON and normalizes numbers', () => {
    expect(parseCrew(JSON.stringify([{ contractor: 'שמחה', workers: '12', hours: 9 }])))
      .toEqual([{ contractor: 'שמחה', workers: 12, hours: 9, from: '', to: '' }])
    expect(parseCrew(undefined)).toEqual([])
    expect(parseCrew('garbage')).toEqual([])
    expect(parseCrew(JSON.stringify([{ contractor: 'x', workers: -3 }]))[0].workers).toBe(0)
  })
  it('filledCrew drops blank rows', () => {
    expect(filledCrew([row(''), row('חמד', 5)])).toEqual([row('חמד', 5)])
  })
  it('derives hours from the reported window, wrapping past midnight', () => {
    expect(parseCrew(JSON.stringify([{ contractor: 'x', workers: 3, hours: 99, from: '07:00', to: '15:30' }])))
      .toEqual([{ contractor: 'x', workers: 3, hours: 8.5, from: '07:00', to: '15:30' }])
    expect(spanHours('22:00', '06:00')).toBe(8)
    expect(spanHours('07:00', 'nope')).toBeNull()
    // a garbage window falls back to the stored total
    expect(parseCrew(JSON.stringify([{ contractor: 'x', workers: 1, hours: 6, from: '99:99', to: '' }]))[0].hours).toBe(6)
  })
  it('parseArrived keeps only uuid-looking ids', () => {
    expect(parseArrived(JSON.stringify(['6f1e2c3a-1111-4222-8333-444455556666', 'nope']))).toEqual(['6f1e2c3a-1111-4222-8333-444455556666'])
    expect(parseArrived(undefined)).toEqual([])
  })
})

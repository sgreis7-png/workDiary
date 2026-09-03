import { describe, expect, it } from 'vitest'
import { filledCrew, parseArrived, parseCrew } from './crewRows'

describe('crew rows', () => {
  it('parses stored JSON and normalizes numbers', () => {
    expect(parseCrew(JSON.stringify([{ contractor: 'שמחה', workers: '12', hours: 9 }])))
      .toEqual([{ contractor: 'שמחה', workers: 12, hours: 9 }])
    expect(parseCrew(undefined)).toEqual([])
    expect(parseCrew('garbage')).toEqual([])
    expect(parseCrew(JSON.stringify([{ contractor: 'x', workers: -3 }]))[0].workers).toBe(0)
  })
  it('filledCrew drops blank rows', () => {
    expect(filledCrew([{ contractor: '', workers: 0, hours: 0 }, { contractor: 'חמד', workers: 5, hours: 8 }]))
      .toEqual([{ contractor: 'חמד', workers: 5, hours: 8 }])
  })
  it('parseArrived keeps only uuid-looking ids', () => {
    expect(parseArrived(JSON.stringify(['6f1e2c3a-1111-4222-8333-444455556666', 'nope']))).toEqual(['6f1e2c3a-1111-4222-8333-444455556666'])
    expect(parseArrived(undefined)).toEqual([])
  })
})

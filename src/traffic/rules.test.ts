import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, rank, worst } from './model'
import { categoryColor, crewColor, grayReason, issuesColor, supplyItemColor, timeColor } from './rules'

const S = DEFAULT_SETTINGS

describe('severity', () => {
  it('orders gray > red > amber > green > na', () => {
    expect([rank('gray'), rank('red'), rank('amber'), rank('green'), rank('na')]).toEqual([4, 3, 2, 1, 0])
    expect(worst('green', 'amber', 'na')).toBe('amber')
    expect(worst('red', 'gray')).toBe('gray')
    expect(worst()).toBe('na')
  })
})

describe('timeColor (project level, spec 4.1)', () => {
  it('is red without a contract date', () => {
    expect(timeColor(null, 10, S)).toEqual({ color: 'red', delta: null })
  })
  it('thresholds: ≤7 green, 8–30 amber, >30 red', () => {
    expect(timeColor('2026-12-01', 7, S).color).toBe('green')
    expect(timeColor('2026-12-01', 8, S).color).toBe('amber')
    expect(timeColor('2026-12-01', 30, S).color).toBe('amber')
    expect(timeColor('2026-12-01', 31, S).color).toBe('red')
    expect(timeColor('2026-12-01', -23, S).color).toBe('green')
  })
  it('is red when the contract date already passed', () => {
    expect(timeColor('2026-01-01', 0, S, '2026-09-03').color).toBe('red')
  })
})

describe('categoryColor (spec 4.1 category level)', () => {
  const base = { critical: false, planned_finish: '2026-08-01', pct: 100, start: '2026-05-01', base_start: '2026-05-01', blocked_due: undefined as string | null | undefined, blocked: false }
  it('finished category on time is green', () => {
    expect(categoryColor(base, S, '2026-09-03')).toBe('green')
  })
  it('finish date passed and pct < 100 is amber', () => {
    expect(categoryColor({ ...base, pct: 80 }, S, '2026-09-03')).toBe('amber')
  })
  it('critical category whose start slipped past baseline is amber', () => {
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', start: '2026-10-05', base_start: '2026-10-01', pct: 0 }, S, '2026-09-03')).toBe('amber')
    expect(categoryColor({ ...base, critical: false, planned_finish: '2026-12-01', start: '2026-10-05', base_start: '2026-10-01', pct: 0 }, S, '2026-09-03')).toBe('green')
  })
  it('critical category blocked with no fix inside 14 days is red', () => {
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', pct: 0, blocked: true, blocked_due: null }, S, '2026-09-03')).toBe('red')
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', pct: 0, blocked: true, blocked_due: '2026-09-30' }, S, '2026-09-03')).toBe('red')
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', pct: 0, blocked: true, blocked_due: '2026-09-10' }, S, '2026-09-03')).toBe('green')
  })
})

describe('supplyItemColor (spec 4.2)', () => {
  const today = '2026-09-03'
  it('on site is green', () => {
    expect(supplyItemColor({ status: 'on_site', need_date: '2026-09-10', eta: null, critical: false }, S, today)).toBe('green')
  })
  it('ETA at least 5 days before need is green, later is amber, none is amber', () => {
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-15', critical: false }, S, today)).toBe('green')
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-16', critical: false }, S, today)).toBe('amber')
    expect(supplyItemColor({ status: 'ordered', need_date: '2026-09-20', eta: null, critical: false }, S, today)).toBe('amber')
  })
  it('ETA after need on a critical category is red', () => {
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-25', critical: true }, S, today)).toBe('red')
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-25', critical: false }, S, today)).toBe('amber')
  })
  it('not ordered and needed within 3 weeks is red, later is amber', () => {
    expect(supplyItemColor({ status: 'not_ordered', need_date: '2026-09-24', eta: null, critical: false }, S, today)).toBe('red')
    expect(supplyItemColor({ status: 'not_ordered', need_date: '2026-09-25', eta: null, critical: false }, S, today)).toBe('amber')
  })
})

describe('crewColor (spec 4.4)', () => {
  it('all contractors ≥ 90% is green', () => {
    expect(crewColor([{ name: 'a', critical: true, ratio: 0.9, absences: 0 }], S)).toBe('green')
  })
  it('70–90% is amber; critical absence day is amber', () => {
    expect(crewColor([{ name: 'a', critical: false, ratio: 0.89, absences: 0 }], S)).toBe('amber')
    expect(crewColor([{ name: 'a', critical: true, ratio: 1, absences: 1 }], S)).toBe('amber')
    expect(crewColor([{ name: 'a', critical: false, ratio: 1, absences: 1 }], S)).toBe('green')
  })
  it('critical < 70% or ≥ 2 absences is red', () => {
    expect(crewColor([{ name: 'a', critical: true, ratio: 0.69, absences: 0 }], S)).toBe('red')
    expect(crewColor([{ name: 'a', critical: false, ratio: 0.69, absences: 0 }], S)).toBe('amber')
    expect(crewColor([{ name: 'a', critical: false, ratio: 1, absences: 2 }], S)).toBe('red')
  })
  it('no contractors is na', () => { expect(crewColor([], S)).toBe('na') })
})

describe('issuesColor (spec 4.5)', () => {
  const today = '2026-09-03'
  it('nothing old, nothing blocking is green', () => {
    expect(issuesColor([{ opened_on: '2026-09-01', owner_email: null, due_date: null, blocking: false, systemic: false }], S, today)).toBe('green')
  })
  it('open > 7 days without owner or date is amber', () => {
    expect(issuesColor([{ opened_on: '2026-08-26', owner_email: null, due_date: '2026-09-20', blocking: false, systemic: false }], S, today)).toBe('amber')
    expect(issuesColor([{ opened_on: '2026-08-26', owner_email: 'x@y', due_date: '2026-09-20', blocking: false, systemic: false }], S, today)).toBe('green')
  })
  it('blocking or systemic is red', () => {
    expect(issuesColor([{ opened_on: '2026-09-02', owner_email: 'x@y', due_date: '2026-09-05', blocking: true, systemic: false }], S, today)).toBe('red')
    expect(issuesColor([{ opened_on: '2026-09-02', owner_email: 'x@y', due_date: '2026-09-05', blocking: false, systemic: true }], S, today)).toBe('red')
  })
})

describe('grayReason (spec 4.6)', () => {
  it('flags a missing diary over the last 2 work days and a stale gantt', () => {
    expect(grayReason({ entryInLastWorkdays: false, ganttAgeDays: 3 }, S)).toContain('יומן')
    expect(grayReason({ entryInLastWorkdays: true, ganttAgeDays: 15 }, S)).toContain('גאנט')
    expect(grayReason({ entryInLastWorkdays: true, ganttAgeDays: null }, S)).toContain('גאנט')
    expect(grayReason({ entryInLastWorkdays: true, ganttAgeDays: 14 }, S)).toBeNull()
  })
})

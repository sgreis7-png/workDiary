// The control centre once counted only quality-control coop records, while the progress
// chart counted coops named in diary reports — same screen, two different answers to
// "how many coops". mergeDiaryCoops is the single list both now read from.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { latestCoopReports, mergeDiaryCoops, normCoopName, progressSeries } = await import('./api')
const { GATE_ORDER } = await import('../defects/model')

const gates = Object.fromEntries(GATE_ORDER.map((g) => [g, null])) as Record<(typeof GATE_ORDER)[number], number | null>

const record = (id: string, name: string) => ({
  id, name, coop_type: null, opened_on: null, execution_manager: null,
  gates, openDefects: 0, overdueDefects: 0,
})

const series = (name: string, pct: number) => ({ name, points: [{ date: '2026-08-01', pct: 10 }, { date: '2026-08-10', pct }] })

describe('mergeDiaryCoops', () => {
  it('adds diary-only coops so every screen counts the same list', () => {
    const merged = mergeDiaryCoops([], [series('לול 1', 40), series('לול 2', 55)])
    expect(merged.map((c) => c.name)).toEqual(['לול 1', 'לול 2'])
    expect(merged.every((c) => c.diaryOnly)).toBe(true)
    expect(merged.map((c) => c.reportedPct)).toEqual([40, 55])
  })

  it('attaches the latest reported percent to a matching record instead of duplicating it', () => {
    const merged = mergeDiaryCoops([record('a', 'לול 1')], [series('לול 1', 70)])
    expect(merged).toHaveLength(1)
    expect(merged[0].diaryOnly).toBeUndefined()
    expect(merged[0].reportedPct).toBe(70)
  })

  it('matches "Coop 3" to "לול 3" and ignores stray whitespace', () => {
    const merged = mergeDiaryCoops([record('a', ' Coop 3 ')], [series('לול 3', 25)])
    expect(merged).toHaveLength(1)
    expect(merged[0].reportedPct).toBe(25)
  })

  it('leaves records without diary reports at reportedPct null', () => {
    const merged = mergeDiaryCoops([record('a', 'לול 9')], [])
    expect(merged[0].reportedPct).toBeNull()
  })

  it('sorts the union numerically by name', () => {
    const merged = mergeDiaryCoops([record('a', 'לול 10')], [series('לול 2', 5)])
    expect(merged.map((c) => c.name)).toEqual(['לול 2', 'לול 10'])
  })
})

describe('latestCoopReports', () => {
  const entry = (id: string, date: string, coops: object[]) => ({
    id, work_date: date, created_by: 'u', created_at: '',
    values: { progress_coops: JSON.stringify(coops) },
  })
  it('keeps the newest report per coop (entries arrive newest-first)', () => {
    const reports = latestCoopReports([
      entry('new', '2026-08-10', [{ name: 'לול 1', pct: 55, rows: [{ task: 'גג', pct: 50, remarks: '' }] }]),
      entry('old', '2026-08-05', [{ name: 'לול 1', pct: 20, rows: [] }, { name: 'לול 2', pct: 10, rows: [] }]),
    ])
    const c1 = reports.get(normCoopName('לול 1'))!
    expect(c1.entryId).toBe('new')
    expect(c1.date).toBe('2026-08-10')
    expect(c1.report.rows[0].task).toBe('גג')
    // לול 2 was not in the newest entry — its latest is the older one
    expect(reports.get(normCoopName('לול 2'))!.entryId).toBe('old')
  })
  it('matches "Coop 1" and "לול 1" to the same coop', () => {
    const reports = latestCoopReports([entry('e', '2026-08-10', [{ name: 'Coop 1', pct: 5, rows: [] }])])
    expect(reports.get(normCoopName('לול 1'))).toBeDefined()
  })
})

describe('progressSeries + mergeDiaryCoops together', () => {
  it('a diary entry with two coops yields two coops in the snapshot list', () => {
    const entries = [{
      id: 'e1', work_date: '2026-08-10', created_by: 'u', created_at: '',
      values: { progress_coops: JSON.stringify([{ name: 'לול 1', pct: 30 }, { name: 'לול 2', pct: 45 }]) },
    }]
    const merged = mergeDiaryCoops([], progressSeries(entries))
    expect(merged).toHaveLength(2)
  })
})

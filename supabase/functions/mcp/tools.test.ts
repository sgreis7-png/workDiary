import { describe, it, expect } from 'vitest'
import { TOOLS, page, type ToolCtx } from './tools'
import { newFakeState, makeFakeSupabase, type FakeState } from '../../../src/test/fakeSupabase'

// A tool result goes straight to a third-party model, so these tests pin the two things that are
// expensive to get wrong: a silent under-count (truncation, denied-as-empty) and a private value
// (a phone answer, an owner e-mail) riding along inside a row nobody thought to inspect.
function ctx(s: FakeState, allow: (a: string) => boolean = () => true): ToolCtx {
  return { db: makeFakeSupabase(s) as unknown as ToolCtx['db'], canView: async (a) => allow(a) }
}
const tool = (name: string) => TOOLS.find((t) => t.name === name)!
const PID = '8a1f2d3e-0000-4000-8000-000000000001'

describe('claude connector tools', () => {
  it('TOOLS names match the spec', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      'get_project', 'get_schedule', 'list_defects', 'list_deliveries', 'list_handovers', 'list_issues',
      'list_people', 'list_projects', 'list_safety_forms', 'search_diary', 'stats', 'traffic_light',
    ])
    for (const t of TOOLS) expect(t.description).toMatch(/YYYY-MM-DD/)
  })

  it('denied area is explicit, not an empty list', async () => {
    const s = newFakeState({ rows: { coop_defects: [{ id: 'd1' }] } })
    const out = await tool('list_defects').run(ctx(s, (a) => a !== 'defects'), {})
    expect(out).toEqual({ denied: 'defects' })
    expect(s.calls.filter((c) => c.table === 'coop_defects')).toEqual([])
  })

  it('list_issues has no up-front denial: RLS decides', async () => {
    const s = newFakeState({ rows: { issues: [{ id: 'i1' }] } })
    const out = await tool('list_issues').run(ctx(s, () => false), {})
    expect(out).toEqual({ rows: [{ id: 'i1' }], truncated: false })
  })

  it('truncated when over limit', async () => {
    expect(page([1, 2, 3], 2)).toEqual({ rows: [1, 2], truncated: true })
    expect(page([1, 2], 2)).toEqual({ rows: [1, 2], truncated: false })
    const s = newFakeState({ rows: { profiles: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } })
    expect(await tool('list_people').run(ctx(s), { limit: 2 })).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], truncated: true })
  })

  it('limit is capped at 1000', () => {
    expect(tool('list_people').input.safeParse({ limit: 5000 }).success).toBe(false)
    expect(tool('list_people').input.safeParse({ limit: 1000 }).success).toBe(true)
    expect(tool('list_issues').input.safeParse({ from: '17/10/2026' }).success).toBe(false)
  })

  it('unknown field keys survive and known ones get their label', async () => {
    const s = newFakeState({
      rows: {
        entries: [{ id: 'e1', created_by: 'u1', work_date: '2026-10-01', values: { f1: 'x', gone: 'y' }, entry_photos: [{ count: 3 }] }],
        field_definitions: [{ key: 'f1', label_he: 'עבודה', type: 'text' }],
        profiles: [{ id: 'u1', name: 'דנה' }],
      },
    })
    const out = await tool('search_diary').run(ctx(s), {}) as { rows: Record<string, unknown>[] }
    expect(out.rows[0].values).toEqual({ 'עבודה': 'x', gone: 'y' })
    expect(out.rows[0].author).toBe('דנה')
    expect(out.rows[0].photos).toBe(3)
  })

  it('a phone-typed diary answer never reaches the output, under its key or its label', async () => {
    const s = newFakeState({
      rows: {
        entries: [{ id: 'e1', created_by: 'u1', values: { f1: 'x', ph: '050-1234567', contact_phone: '052-7654321' } }],
        field_definitions: [{ key: 'f1', label_he: 'עבודה', type: 'text' }, { key: 'ph', label_he: 'טלפון', type: 'phone' }],
        profiles: [],
      },
    })
    const out = JSON.stringify(await tool('search_diary').run(ctx(s), {}))
    expect(out).not.toContain('050-1234567')
    expect(out).not.toContain('052-7654321')
    expect(out).not.toContain('טלפון')
  })

  it('handover carries na and no signature', async () => {
    const s = newFakeState({
      rows: {
        handover_forms: [{
          id: 'h1', project_id: 'p1', receiver_name: 'רן', signed_at: '2026-10-02T10:00:00Z',
          systems: [{ label: 'חימום', status: 'na', note: '' }, { label: 'האכלה', status: 'ok' }, { label: 'x' }],
          receiver_signature: 'DATA',
        }],
      },
    })
    const out = await tool('list_handovers').run(ctx(s), {}) as { rows: Record<string, unknown>[] }
    expect(out.rows[0].signed).toBe(true)
    expect(out.rows[0].systems).toEqual([
      { label: 'חימום', status: 'na', note: '' }, { label: 'האכלה', status: 'ok', note: null }, { label: 'x', status: null, note: null },
    ])
    expect('receiver_signature' in out.rows[0]).toBe(false)
  })

  it('an unsigned handover reports signed: false', async () => {
    const s = newFakeState({ rows: { handover_forms: [{ id: 'h1', signed_at: null, systems: [] }] } })
    const out = await tool('list_handovers').run(ctx(s), {}) as { rows: Record<string, unknown>[] }
    expect(out.rows[0].signed).toBe(false)
  })

  it('rpc output is scrubbed of nested owner_email', async () => {
    const s = newFakeState({ rpcRows: { traffic_light: [{ project: 'p1', color: 'red', axes: [{ owner_email: 'a@b.c', owner_name: 'Dana' }] }] } })
    const out = JSON.stringify(await tool('traffic_light').run(ctx(s), { project_id: PID }))
    expect(out).not.toContain('owner_email')
    expect(out).not.toContain('a@b.c')
    expect(out).toContain('Dana')
    expect(s.calls.find((c) => c.op === 'rpc')?.payload).toEqual({ p_project: PID })
  })

  it('stats is denied without the dashboard area and calls dashboard_stats() otherwise', async () => {
    const s = newFakeState({ rpcRows: { dashboard_stats: { total: 4 } } })
    expect(await tool('stats').run(ctx(s, (a) => a !== 'dashboard'), {})).toEqual({ denied: 'dashboard' })
    expect(await tool('stats').run(ctx(s), {})).toEqual({ total: 4 })
  })

  it('rpc failure surfaces as an error, not as empty data', async () => {
    const s = newFakeState({ rpcFail: { traffic_light: { message: 'forbidden' } } })
    await expect(tool('traffic_light').run(ctx(s), {})).rejects.toThrow('forbidden')
  })

  it('get_schedule flags overdue unfinished tasks', async () => {
    const s = newFakeState({
      rows: {
        gantt_charts: [{ id: 'c1', name: 'plan' }],
        gantt_tasks: [
          { id: 't1', name: 'late', finish_ts: '2020-01-01T00:00:00', pct: 40, is_summary: false },
          { id: 't2', name: 'done', finish_ts: '2020-01-01T00:00:00', pct: 100, is_summary: false },
        ],
        gantt_links: [],
      },
    })
    const out = await tool('get_schedule').run(ctx(s), { project_id: PID }) as { tasks: { overdue: boolean }[] }
    expect(out.tasks.map((t) => t.overdue)).toEqual([true, false])
  })
})

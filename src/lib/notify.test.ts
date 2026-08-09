// Covers the notification fan-out rules that RLS enforces. These were the
// source of a live bug: a recipient list built from project_assignments still
// contained a deactivated worker, and because notifications are inserted as one
// batch, the policy rejected the whole thing — silently muting everyone.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeSupabase, newFakeState } from '../test/fakeSupabase'

const ACTIVE = ['alon@agrotop.co.il', 'zohar@agrotop.co.il']
const state = newFakeState()

vi.mock('./supabase', () => ({ supabase: makeFakeSupabase(state) }))

const { activeRecipients, notifyMany } = await import('./notify')

const batchInserts = () => state.calls.filter((c) => c.table === 'notifications' && Array.isArray(c.payload))
const rowInserts = () => state.calls.filter((c) => c.table === 'notifications' && !Array.isArray(c.payload))

beforeEach(() => {
  state.calls = []
  state.fail = {}
  // activeRecipients asks the server to filter, so the fixture is the function's
  // answer rather than the raw table
  state.rows = {}
  state.rpcRows = { active_recipients: ACTIVE.map((email) => ({ email })) }
  state.rpcFail = {}
})

describe('activeRecipients', () => {
  // the active filter runs server-side in active_recipients(), so the fixture rows are
  // the function's answer, not the raw table
  it('keeps only addresses the server reports as active', async () => {
    state.rpcRows = { active_recipients: [{ email: 'alon@agrotop.co.il' }] }
    expect(await activeRecipients(['alon@agrotop.co.il', 'gone@agrotop.co.il']))
      .toEqual(['alon@agrotop.co.il'])
  })
  it('normalises case and removes duplicates before querying', async () => {
    state.rpcRows = { active_recipients: [{ email: 'ALON@agrotop.co.il' }] }
    expect(await activeRecipients(['alon@agrotop.co.il', 'ALON@agrotop.co.il']))
      .toEqual(['alon@agrotop.co.il'])
  })
  it('returns nothing for an empty list without querying', async () => {
    expect(await activeRecipients([])).toEqual([])
  })
  it('throws rather than reporting "nobody is active" when the lookup fails', async () => {
    state.rpcFail = { active_recipients: { message: 'network' } }
    await expect(activeRecipients(['alon@agrotop.co.il'])).rejects.toBeTruthy()
  })
})

describe('notifyMany', () => {
  it('writes one batch containing only active recipients', async () => {
    state.rpcRows = { active_recipients: [{ email: 'alon@agrotop.co.il' }] }
    await notifyMany(['alon@agrotop.co.il', 'gone@agrotop.co.il'], { title: 'x' })
    expect(batchInserts()).toHaveLength(1)
    const rows = batchInserts()[0].payload as { recipient_email: string }[]
    expect(rows.map((r) => r.recipient_email)).toEqual(['alon@agrotop.co.il'])
  })

  it('never inserts when nobody is left after filtering', async () => {
    state.rpcRows = { active_recipients: [] }
    await notifyMany(['gone@agrotop.co.il'], { title: 'x' })
    expect(state.calls.filter((c) => c.table === 'notifications')).toHaveLength(0)
  })

  it('falls back to per-recipient inserts if the batch is rejected', async () => {
    state.fail = { notifications: { message: 'row-level security' } }
    await notifyMany(ACTIVE, { title: 'x' })
    // one row per recipient, so one bad address cannot mute the others
    expect(rowInserts()).toHaveLength(2)
  })

  it('returns the addresses it wrote, so push does not re-filter', async () => {
    state.rpcRows = { active_recipients: [{ email: 'alon@agrotop.co.il' }] }
    expect(await notifyMany(['alon@agrotop.co.il', 'gone@agrotop.co.il'], { title: 'x' }))
      .toEqual(['alon@agrotop.co.il'])
  })

  it('does not throw, and notifies nobody, when the member lookup fails', async () => {
    state.rpcFail = { active_recipients: { message: 'network' } }
    await expect(notifyMany(['alon@agrotop.co.il'], { title: 'x' })).resolves.toEqual([])
    expect(state.calls.filter((c) => c.table === 'notifications')).toHaveLength(0)
  })
})

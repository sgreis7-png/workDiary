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
  // the fake returns these for `allowed_emails`; activeRecipients narrows with .in()
  state.rows = { allowed_emails: ACTIVE.map((email) => ({ email })) }
})

describe('activeRecipients', () => {
  // the active filter runs server-side (.eq('active', true).in('email', wanted)),
  // so the fixture rows are the server's answer, not the raw table
  it('keeps only addresses the server reports as active', async () => {
    state.rows = { allowed_emails: [{ email: 'alon@agrotop.co.il' }] }
    expect(await activeRecipients(['alon@agrotop.co.il', 'gone@agrotop.co.il']))
      .toEqual(['alon@agrotop.co.il'])
  })
  it('normalises case and removes duplicates before querying', async () => {
    state.rows = { allowed_emails: [{ email: 'ALON@agrotop.co.il' }] }
    expect(await activeRecipients(['alon@agrotop.co.il', 'ALON@agrotop.co.il']))
      .toEqual(['alon@agrotop.co.il'])
  })
  it('returns nothing for an empty list without querying', async () => {
    expect(await activeRecipients([])).toEqual([])
  })
  it('throws rather than reporting "nobody is active" when the lookup fails', async () => {
    state.fail = { allowed_emails: { message: 'network' } }
    await expect(activeRecipients(['alon@agrotop.co.il'])).rejects.toBeTruthy()
  })
})

describe('notifyMany', () => {
  it('writes one batch containing only active recipients', async () => {
    state.rows = { allowed_emails: [{ email: 'alon@agrotop.co.il' }] }
    await notifyMany(['alon@agrotop.co.il', 'gone@agrotop.co.il'], { title: 'x' })
    expect(batchInserts()).toHaveLength(1)
    const rows = batchInserts()[0].payload as { recipient_email: string }[]
    expect(rows.map((r) => r.recipient_email)).toEqual(['alon@agrotop.co.il'])
  })

  it('never inserts when nobody is left after filtering', async () => {
    state.rows = { allowed_emails: [] }
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
    state.rows = { allowed_emails: [{ email: 'alon@agrotop.co.il' }] }
    expect(await notifyMany(['alon@agrotop.co.il', 'gone@agrotop.co.il'], { title: 'x' }))
      .toEqual(['alon@agrotop.co.il'])
  })

  it('does not throw, and notifies nobody, when the member lookup fails', async () => {
    state.fail = { allowed_emails: { message: 'network' } }
    await expect(notifyMany(['alon@agrotop.co.il'], { title: 'x' })).resolves.toEqual([])
    expect(state.calls.filter((c) => c.table === 'notifications')).toHaveLength(0)
  })
})

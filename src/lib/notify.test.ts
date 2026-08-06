// Covers the notification fan-out rules that RLS enforces. These were the
// source of a live bug: a recipient list built from project_assignments still
// contained a deactivated worker, and because notifications are inserted as one
// batch, the policy rejected the whole thing — silently muting everyone.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  active: ['alon@agrotop.co.il', 'zohar@agrotop.co.il'],
  inserts: [] as unknown[],
  failBatch: false,
  selectError: null as { message: string } | null,
}

vi.mock('./supabase', () => ({
  supabase: {
    from(table: string) {
      if (table === 'allowed_emails') {
        // mirrors the real query: .select('email').eq('active', true).in('email', wanted)
        return {
          select: () => ({
            eq: () => ({
              in: (_col: string, wanted: string[]) => Promise.resolve({
                data: state.active.filter((e) => wanted.includes(e)).map((email) => ({ email })),
                error: state.selectError,
              }),
            }),
          }),
        }
      }
      // notifications
      return {
        insert(rows: unknown) {
          const isBatch = Array.isArray(rows)
          if (isBatch && state.failBatch) {
            return Promise.resolve({ error: { message: 'row-level security' } })
          }
          state.inserts.push(rows)
          return Promise.resolve({ error: null })
        },
      }
    },
  },
}))

const { activeRecipients, notifyMany } = await import('./notify')

describe('activeRecipients', () => {
  beforeEach(() => { state.inserts = []; state.failBatch = false; state.selectError = null })

  it('drops addresses that are no longer active members', async () => {
    const out = await activeRecipients(['alon@agrotop.co.il', 'gone@agrotop.co.il'])
    expect(out).toEqual(['alon@agrotop.co.il'])
  })
  it('normalises case and removes duplicates', async () => {
    expect(await activeRecipients(['ALON@agrotop.co.il', 'alon@agrotop.co.il']))
      .toEqual(['alon@agrotop.co.il'])
  })
  it('returns nothing for an empty or all-inactive list', async () => {
    expect(await activeRecipients([])).toEqual([])
    expect(await activeRecipients(['gone@agrotop.co.il'])).toEqual([])
  })
})

describe('notifyMany', () => {
  beforeEach(() => { state.inserts = []; state.failBatch = false; state.selectError = null })

  it('writes one batch containing only active recipients', async () => {
    await notifyMany(['alon@agrotop.co.il', 'gone@agrotop.co.il'], { title: 'x' })
    expect(state.inserts).toHaveLength(1)
    const rows = state.inserts[0] as { recipient_email: string }[]
    expect(rows.map((r) => r.recipient_email)).toEqual(['alon@agrotop.co.il'])
  })

  it('never inserts when nobody is left after filtering', async () => {
    await notifyMany(['gone@agrotop.co.il'], { title: 'x' })
    expect(state.inserts).toHaveLength(0)
  })

  it('falls back to per-recipient inserts if the batch is rejected', async () => {
    state.failBatch = true
    await notifyMany(['alon@agrotop.co.il', 'zohar@agrotop.co.il'], { title: 'x' })
    // one row per recipient, so one bad address cannot mute the others
    expect(state.inserts).toHaveLength(2)
    expect(state.inserts.every((r) => !Array.isArray(r))).toBe(true)
  })

  it('returns the addresses it wrote, so push does not re-filter', async () => {
    const to = await notifyMany(['alon@agrotop.co.il', 'gone@agrotop.co.il'], { title: 'x' })
    expect(to).toEqual(['alon@agrotop.co.il'])
  })

  it('does not throw, and notifies nobody, when the member lookup fails', async () => {
    state.selectError = { message: 'network' }
    await expect(activeRecipients(['alon@agrotop.co.il'])).rejects.toBeTruthy()
    await expect(notifyMany(['alon@agrotop.co.il'], { title: 'x' })).resolves.toEqual([])
    expect(state.inserts).toHaveLength(0)
  })
})

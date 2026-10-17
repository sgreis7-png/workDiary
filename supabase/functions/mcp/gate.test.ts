import { describe, it, expect } from 'vitest'
import { gate, type GateDb } from './gate.ts'

// The gate is the only thing standing between "has a Supabase login" and "can pipe company data
// into a third-party model". Every logged-in member holds a valid token, so a gate that let a
// member through, or that read can_view for the wrong area, would quietly hand the connector to
// the whole field staff — and nothing in the app would show it happened.

type Fake = { user: { id: string } | null; role: string; areas: string[]; calls: { name: string; args?: unknown }[] }

function fakeDb(f: Partial<Fake>): { db: GateDb; calls: Fake['calls'] } {
  const s: Fake = { user: { id: 'u1' }, role: 'member', areas: [], calls: [], ...f }
  const db: GateDb = {
    from() { throw new Error('gate must not read tables') },
    rpc(name, args) {
      s.calls.push({ name, args })
      if (name === 'my_role') return Promise.resolve({ data: s.role, error: null })
      if (name === 'can_view') return Promise.resolve({ data: s.areas.includes(String(args?.p_area)), error: null })
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } })
    },
    auth: {
      getUser: () => Promise.resolve(
        s.user ? { data: { user: s.user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } },
      ),
    },
  }
  return { db, calls: s.calls }
}

describe('gate', () => {
  it('no user → unauthenticated, and asks the database nothing', async () => {
    const { db, calls } = fakeDb({ user: null })
    expect(await gate(db)).toEqual({ ok: false, reason: 'unauthenticated' })
    expect(calls).toEqual([])
  })

  it('member role → role, even when the claude area is granted', async () => {
    // A stray user_permissions row must not lift a member over the role floor.
    const { db } = fakeDb({ role: 'member', areas: ['claude'] })
    expect(await gate(db)).toEqual({ ok: false, reason: 'role' })
  })

  it('manager without claude → not_enabled', async () => {
    const { db, calls } = fakeDb({ role: 'manager', areas: ['logbook'] })
    expect(await gate(db)).toEqual({ ok: false, reason: 'not_enabled' })
    expect(calls).toContainEqual({ name: 'can_view', args: { p_area: 'claude' } })
  })

  it('manager with claude → ok with the user id', async () => {
    const { db } = fakeDb({ user: { id: 'mgr-7' }, role: 'manager', areas: ['claude'] })
    expect(await gate(db)).toEqual({ ok: true, userId: 'mgr-7' })
  })

  it('admin → ok', async () => {
    // perm_level gives admins edit everywhere, so can_view('claude') is true for them.
    const { db } = fakeDb({ user: { id: 'adm-1' }, role: 'admin', areas: ['claude'] })
    expect(await gate(db)).toEqual({ ok: true, userId: 'adm-1' })
  })

  it('a failing permission lookup is an error, never a pass', async () => {
    const { db } = fakeDb({ role: 'manager' })
    db.rpc = () => Promise.resolve({ data: null, error: { message: 'boom' } })
    await expect(gate(db)).rejects.toThrow('boom')
  })
})

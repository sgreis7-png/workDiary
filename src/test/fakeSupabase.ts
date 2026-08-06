// One fake Supabase client for the IO tests.
//
// Each IO test used to hand-roll its own, so the two copies modelled the
// query-builder differently and neither was checked against the real shape —
// if supabase-js changed `.insert().select().single()`, both suites would have
// stayed green. Keeping a single fake means a shape change breaks in one place.
import { vi } from 'vitest'

export interface Call { table: string; op: string; payload?: unknown }

export interface FakeState {
  /** rows returned by `select()` per table */
  rows: Record<string, unknown[]>
  /** tables whose next write should fail, with this error */
  fail: Record<string, { message: string } | undefined>
  /** value returned by `.select().single()` after an insert */
  inserted: Record<string, unknown>
  calls: Call[]
  uploads: string[]
  removed: string[]
  /** index of the upload that should fail, -1 for none */
  failUploadAt: number
  userId: string
}

export function newFakeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    rows: {}, fail: {}, inserted: {},
    calls: [], uploads: [], removed: [],
    failUploadAt: -1, userId: 'user-1',
    ...overrides,
  }
}

/**
 * Build a stand-in for the supabase client. Only the surface the data layer
 * actually uses is modelled; anything else throws loudly rather than silently
 * returning undefined, so an untested call path is obvious.
 */
export function makeFakeSupabase(s: FakeState) {
  const result = (table: string) => ({ data: s.rows[table] ?? [], error: s.fail[table] ?? null })

  const thenable = (table: string) => {
    const p = Promise.resolve(result(table))
    return Object.assign(p, {
      eq: () => thenable(table),
      in: () => thenable(table),
      ilike: () => thenable(table),
      order: () => thenable(table),
      limit: () => thenable(table),
      single: () => Promise.resolve({
        data: (s.rows[table] ?? [])[0] ?? null,
        error: s.fail[table] ?? null,
      }),
      maybeSingle: () => Promise.resolve({ data: (s.rows[table] ?? [])[0] ?? null, error: null }),
    })
  }

  const from = (table: string) => ({
    select: () => thenable(table),
    insert(payload: unknown) {
      s.calls.push({ table, op: 'insert', payload })
      const err = s.fail[table] ?? null
      const done = Promise.resolve({ error: err })
      return Object.assign(done, {
        select: () => ({
          single: () => Promise.resolve({ data: err ? null : s.inserted[table] ?? null, error: err }),
        }),
      })
    },
    update(payload: unknown) {
      s.calls.push({ table, op: 'update', payload })
      return { eq: () => Promise.resolve({ error: s.fail[table] ?? null }) }
    },
    upsert(payload: unknown) {
      s.calls.push({ table, op: 'upsert', payload })
      return Promise.resolve({ error: s.fail[table] ?? null })
    },
    delete() {
      s.calls.push({ table, op: 'delete' })
      return { eq: () => Promise.resolve({ error: s.fail[table] ?? null }) }
    },
  })

  return {
    from,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: s.userId } } }) },
    storage: {
      from: () => ({
        upload: (path: string) => {
          const i = s.uploads.length
          s.uploads.push(path)
          return Promise.resolve({ error: i === s.failUploadAt ? { message: 'upload failed' } : null })
        },
        remove: (paths: string[]) => { s.removed.push(...paths); return Promise.resolve({ error: null }) },
        createSignedUrls: () => Promise.resolve({ data: [] }),
      }),
    },
  }
}

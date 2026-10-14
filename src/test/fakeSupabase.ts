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
  /** object names already in the bucket — an upload onto one of these collides */
  stored: Set<string>
  removed: string[]
  /** TTLs passed to createSignedUrls, in call order */
  signTtls: number[]
  /** index of the upload that should fail, -1 for none */
  failUploadAt: number
  userId: string
  /** rows returned by `rpc(name)`, keyed by function name */
  rpcRows: Record<string, unknown>
  /** functions whose next call should fail, with this error */
  rpcFail: Record<string, { message: string } | undefined>
}

export function newFakeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    rows: {}, fail: {}, inserted: {},
    calls: [], uploads: [], stored: new Set(), removed: [], signTtls: [],
    failUploadAt: -1,
  rpcRows: {},
  rpcFail: {}, userId: 'user-1',
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
      gte: () => thenable(table),
      lte: () => thenable(table),
      range: () => thenable(table),
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
      const done = () => Promise.resolve({ error: s.fail[table] ?? null })
      return { eq: done, in: done }
    },
  })

  return {
    from,
    // Records the call so a test can assert what was asked for, and answers from
    // rpcRows. Unstubbed functions still return null, which is what a caller that does
    // not care about the result sees.
    rpc: vi.fn((name: string, params?: unknown) => {
      s.calls.push({ table: `rpc:${name}`, op: 'rpc', payload: params })
      const err = s.rpcFail?.[name]
      if (err) return Promise.resolve({ data: null, error: err })
      return Promise.resolve({ data: s.rpcRows?.[name] ?? null, error: null })
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: s.userId } } }) },
    storage: {
      from: () => ({
        // Collisions behave as production does. The photos bucket has insert, select and
        // delete policies but no update policy, so `upsert: true` onto an existing object is an
        // RLS refusal, while a plain upload gets storage's 409 "already exists".
        upload: (path: string, _body?: unknown, opts?: { upsert?: boolean }) => {
          const i = s.uploads.length
          s.uploads.push(path)
          if (i === s.failUploadAt) return Promise.resolve({ error: { message: 'upload failed' } })
          if (s.stored.has(path)) {
            return Promise.resolve({ error: opts?.upsert
              ? { message: 'new row violates row-level security policy', status: 400, statusCode: '403' }
              : { message: 'The resource already exists', status: 400, statusCode: '409' } })
          }
          s.stored.add(path)
          return Promise.resolve({ error: null })
        },
        remove: (paths: string[]) => { s.removed.push(...paths); return Promise.resolve({ error: null }) },
        createSignedUrls: (paths: string[], ttl: number) => {
          s.signTtls.push(ttl)
          return Promise.resolve({ data: paths.map((p) => ({ path: p, signedUrl: `signed:${p}?exp=${ttl}` })) })
        },
      }),
    },
  }
}

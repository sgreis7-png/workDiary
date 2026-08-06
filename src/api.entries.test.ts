// The entry save path: the code where a lost write means a field worker loses a
// day's report. Previously untested because it only exists as Supabase calls —
// stubbing the client makes the ordering and error contracts assertable.
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Call { table: string; op: string; payload?: unknown }

const db = {
  calls: [] as Call[],
  uploads: [] as string[],
  removed: [] as string[],
  failUploadAt: -1,
  entryInsertError: null as { message: string } | null,
}

vi.mock('./lib/supabase', () => {
  const table = (name: string) => ({
    insert(payload: unknown) {
      db.calls.push({ table: name, op: 'insert', payload })
      if (name === 'entries' && db.entryInsertError) {
        return { select: () => ({ single: () => Promise.resolve({ data: null, error: db.entryInsertError }) }) }
      }
      const res = { data: { id: 'entry-1' }, error: null }
      return Object.assign(Promise.resolve({ error: null }), {
        select: () => ({ single: () => Promise.resolve(res) }),
      })
    },
    update(payload: unknown) {
      db.calls.push({ table: name, op: 'update', payload })
      return { eq: () => Promise.resolve({ error: null }) }
    },
    delete() {
      db.calls.push({ table: name, op: 'delete' })
      return { eq: () => Promise.resolve({ error: null }) }
    },
    select() {
      return {
        eq: () => Promise.resolve({ data: [], error: null }),
        order: () => Promise.resolve({ data: [], error: null }),
      }
    },
  })
  return {
    supabase: {
      from: table,
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
      storage: {
        from: () => ({
          upload: (path: string) => {
            const i = db.uploads.length
            db.uploads.push(path)
            return Promise.resolve({ error: i === db.failUploadAt ? { message: 'upload failed' } : null })
          },
          remove: (paths: string[]) => { db.removed.push(...paths); return Promise.resolve({ error: null }) },
          createSignedUrls: () => Promise.resolve({ data: [] }),
        }),
      },
    },
  }
})
vi.mock('./lib/notifyNewRecord', () => ({ notifyNewEntry: () => {}, notifyNewDefect: () => {} }))

const { createEntry, updateEntry } = await import('./api')

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  db.calls = []; db.uploads = []; db.removed = []
  db.failUploadAt = -1; db.entryInsertError = null
})

describe('createEntry', () => {
  it('stamps the author and returns the new id', async () => {
    const id = await createEntry('proj-1', { work_date: '2026-08-06' }, [])
    expect(id).toBe('entry-1')
    const insert = db.calls.find((c) => c.table === 'entries')!
    expect(insert.payload).toMatchObject({ project_id: 'proj-1', created_by: 'user-1', work_date: '2026-08-06' })
  })

  it('stores a null work_date rather than an empty string', async () => {
    await createEntry('proj-1', { work_date: '' }, [])
    expect((db.calls[0].payload as { work_date: unknown }).work_date).toBeNull()
  })

  it('uploads each photo under the entry id and records a row per file', async () => {
    await createEntry('proj-1', {}, [file('a.jpg'), file('b.jpg')])
    expect(db.uploads).toHaveLength(2)
    // the storage-delete policy keys on this prefix — if it changes, owners can
    // no longer delete their own photos
    expect(db.uploads.every((p) => p.startsWith('entry-1/'))).toBe(true)
    expect(db.calls.filter((c) => c.table === 'entry_photos' && c.op === 'insert')).toHaveLength(2)
  })

  it('sanitises filenames so the storage path stays predictable', async () => {
    await createEntry('proj-1', {}, [file('דוח שטח (1).jpg')])
    expect(db.uploads[0]).toMatch(/^entry-1\/[0-9a-f-]+-_1_\.jpg$/)
  })

  it('throws without writing anything when the entry insert fails', async () => {
    db.entryInsertError = { message: 'rls' }
    await expect(createEntry('proj-1', {}, [file('a.jpg')])).rejects.toBeTruthy()
    expect(db.uploads).toHaveLength(0)
  })

  it('surfaces an upload failure instead of silently dropping the photo', async () => {
    db.failUploadAt = 0
    await expect(createEntry('proj-1', {}, [file('a.jpg')])).rejects.toBeTruthy()
    expect(db.calls.some((c) => c.table === 'entry_photos')).toBe(false)
  })
})

describe('updateEntry', () => {
  it('removes the photo row and the stored object for each removed path', async () => {
    await updateEntry('entry-1', 'proj-1', {}, [], ['entry-1/old.jpg'])
    expect(db.removed).toEqual(['entry-1/old.jpg'])
    expect(db.calls.some((c) => c.table === 'entry_photos' && c.op === 'delete')).toBe(true)
  })

  it('adds new photos under the edited entry id', async () => {
    await updateEntry('entry-1', 'proj-1', {}, [file('new.jpg')], [])
    expect(db.uploads[0]).toMatch(/^entry-1\//)
  })
})

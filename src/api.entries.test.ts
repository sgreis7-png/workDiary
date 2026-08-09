// The entry save path: the code where a lost write means a field worker loses a
// day's report. Previously untested because it only exists as Supabase calls —
// the shared fake client (src/test/fakeSupabase.ts) makes the ordering and
// error contracts assertable.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeSupabase, newFakeState } from './test/fakeSupabase'

const state = newFakeState({ inserted: { entries: { id: 'entry-1' } } })

vi.mock('./lib/supabase', () => ({ supabase: makeFakeSupabase(state) }))
vi.mock('./lib/notifyNewRecord', () => ({ notifyNewEntry: () => {}, notifyNewDefect: () => {} }))

const { createEntry, updateEntry } = await import('./api')

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  state.calls = []; state.uploads = []; state.removed = []
  state.failUploadAt = -1; state.fail = {}
  state.inserted = { entries: { id: 'entry-1' } }
})

describe('createEntry', () => {
  it('stamps the author and returns the new id', async () => {
    const id = await createEntry('proj-1', { work_date: '2026-08-06' }, [])
    expect(id).toBe('entry-1')
    expect(state.calls.find((c) => c.table === 'entries')!.payload)
      .toMatchObject({ project_id: 'proj-1', created_by: 'user-1', work_date: '2026-08-06' })
  })

  it('stores a null work_date rather than an empty string', async () => {
    await createEntry('proj-1', { work_date: '' }, [])
    expect((state.calls[0].payload as { work_date: unknown }).work_date).toBeNull()
  })

  it('uploads each photo under the entry id and records a row per file', async () => {
    await createEntry('proj-1', {}, [file('a.jpg'), file('b.jpg')])
    expect(state.uploads).toHaveLength(2)
    // the storage-delete policy keys on this prefix — if it changes, owners can
    // no longer delete their own photos
    expect(state.uploads.every((p) => p.startsWith('entry-1/'))).toBe(true)
    expect(state.calls.filter((c) => c.table === 'entry_photos' && c.op === 'insert')).toHaveLength(2)
  })

  it('sanitises filenames so the storage path stays predictable', async () => {
    await createEntry('proj-1', {}, [file('דוח שטח (1).jpg')])
    expect(state.uploads[0]).toMatch(/^entry-1\/[0-9a-f-]+-_1_\.jpg$/)
  })

  it('throws without writing anything when the entry insert fails', async () => {
    state.fail = { entries: { message: 'rls' } }
    await expect(createEntry('proj-1', {}, [file('a.jpg')])).rejects.toBeTruthy()
    expect(state.uploads).toHaveLength(0)
  })

  it('surfaces an upload failure instead of silently dropping the photo', async () => {
    state.failUploadAt = 0
    await expect(createEntry('proj-1', {}, [file('a.jpg')])).rejects.toBeTruthy()
    expect(state.calls.some((c) => c.table === 'entry_photos')).toBe(false)
  })

  it('surfaces a failure on a later photo too, not just the first', async () => {
    state.failUploadAt = 1
    await expect(createEntry('proj-1', {}, [file('a.jpg'), file('b.jpg')])).rejects.toBeTruthy()
    // the first photo is already committed — the entry is left partial by design,
    // and the draft in IndexedDB still holds the user's work
    expect(state.calls.filter((c) => c.table === 'entry_photos')).toHaveLength(1)
  })

  it('lets the photos that did upload finish even when one of them fails', async () => {
    // Uploads run concurrently now. The failure still has to surface, but abandoning the
    // photos already in flight would leave storage objects with no row pointing at them.
    state.failUploadAt = 1
    await expect(createEntry('proj-1', {}, [file('a.jpg'), file('b.jpg'), file('c.jpg')]))
      .rejects.toBeTruthy()
    expect(state.uploads).toHaveLength(3)
    expect(state.calls.filter((c) => c.table === 'entry_photos' && c.op === 'insert')).toHaveLength(2)
  })
})

describe('updateEntry', () => {
  it('removes the photo row and the stored object for each removed path', async () => {
    await updateEntry('entry-1', 'proj-1', {}, [], ['entry-1/old.jpg'])
    expect(state.removed).toEqual(['entry-1/old.jpg'])
    expect(state.calls.some((c) => c.table === 'entry_photos' && c.op === 'delete')).toBe(true)
  })

  it('surfaces a failure to remove the photo row', async () => {
    // the row drives what the report shows, so silently keeping a photo the
    // user deleted is worse than failing the save
    state.fail = { entry_photos: { message: 'rls' } }
    await expect(updateEntry('entry-1', 'proj-1', {}, [], ['entry-1/old.jpg'])).rejects.toBeTruthy()
  })

  it('adds new photos under the edited entry id', async () => {
    await updateEntry('entry-1', 'proj-1', {}, [file('new.jpg')], [])
    expect(state.uploads[0]).toMatch(/^entry-1\//)
  })

  it('clears several removed photos in one round trip each', async () => {
    const gone = ['entry-1/a.jpg', 'entry-1/b.jpg', 'entry-1/c.jpg']
    await updateEntry('entry-1', 'proj-1', {}, [], gone)
    expect(state.removed).toEqual(gone)
    // one row delete for the whole list, not one per photo
    expect(state.calls.filter((c) => c.table === 'entry_photos' && c.op === 'delete')).toHaveLength(1)
  })
})

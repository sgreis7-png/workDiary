import { describe, it, expect, beforeEach } from 'vitest'
import { clear, createStore } from 'idb-keyval'
import { saveDraft, loadDraft, clearDraft } from './draft'

const store = createStore('agrotop-wd-drafts', 'entry-drafts')
const draft = () => ({
  project_id: 'p1',
  values: { site_location: 'כפר יובל' },
  files: [new File(['abc'], 'pic.jpg', { type: 'image/jpeg' })],
  removed_paths: [] as string[],
})

describe('entry draft persistence', () => {
  beforeEach(async () => { await clear(store) })

  it('saves and restores a draft, photo files included', async () => {
    expect(await loadDraft('new')).toBeNull()
    await saveDraft('new', draft())
    const d = await loadDraft('new')
    expect(d).not.toBeNull()
    expect(d!.project_id).toBe('p1')
    expect(d!.values.site_location).toBe('כפר יובל')
    expect(d!.files).toHaveLength(1)
    expect(d!.files[0].name).toBe('pic.jpg')
    expect(await d!.files[0].text()).toBe('abc')
  })

  it('keeps drafts per key', async () => {
    await saveDraft('new', draft())
    await saveDraft('e1', { ...draft(), project_id: 'p2' })
    expect((await loadDraft('new'))!.project_id).toBe('p1')
    expect((await loadDraft('e1'))!.project_id).toBe('p2')
  })

  it('clears a draft', async () => {
    await saveDraft('new', draft())
    await clearDraft('new')
    expect(await loadDraft('new')).toBeNull()
  })

  it('drops stale drafts (older than 24h)', async () => {
    await saveDraft('new', draft())
    // backdate the stored draft
    const { get, set } = await import('idb-keyval')
    const raw = await get('new', store)
    await set('new', { ...raw, updated_at: new Date(Date.now() - 25 * 3600_000).toISOString() }, store)
    expect(await loadDraft('new')).toBeNull()
  })
})

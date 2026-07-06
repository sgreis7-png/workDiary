// Entry-form draft persistence. On phones the OS often kills the PWA while the
// camera app is open; the draft (field values + photo files) is kept in IndexedDB
// so the form survives the reload instead of losing the photos and text.
// Note: a separate database (not 'agrotop-wd') — idb-keyval can't add a second
// object store to an existing database.
import { del, get, set, createStore } from 'idb-keyval'

const store = createStore('agrotop-wd-drafts', 'entry-drafts')
const MAX_AGE_MS = 24 * 3600_000

export interface EntryDraft {
  project_id: string
  values: Record<string, string>
  files: File[]
  removed_paths: string[]
  updated_at: string
}

export async function saveDraft(key: string, d: Omit<EntryDraft, 'updated_at'>): Promise<void> {
  await set(key, { ...d, updated_at: new Date().toISOString() } satisfies EntryDraft, store)
}

/** Restore a draft; stale drafts (>24h) are dropped so old junk never reappears. */
export async function loadDraft(key: string): Promise<EntryDraft | null> {
  const d = await get<EntryDraft>(key, store)
  if (!d) return null
  if (Date.now() - new Date(d.updated_at).getTime() > MAX_AGE_MS) {
    await del(key, store)
    return null
  }
  return d
}

export async function clearDraft(key: string): Promise<void> {
  await del(key, store)
}

// Entry-form draft persistence. On phones the OS often kills the PWA while the
// camera app is open; the draft (field values + photo files) is kept in IndexedDB
// so the form survives the reload instead of losing the photos and text.
// Note: a separate database (not 'agrotop-wd') — idb-keyval can't add a second
// object store to an existing database.
import { del, get, set, createStore } from 'idb-keyval'

const store = createStore('agrotop-wd-drafts', 'entry-drafts')
const MAX_AGE_MS = 24 * 3600_000

export interface EntryDraft {
  /** The id the entry will be saved under. Kept with the draft so a retry — including one
   *  after the PWA was killed and the form restored — finishes that entry instead of
   *  creating a second. Absent in drafts written before this existed. */
  entry_id?: string
  project_id: string
  values: Record<string, string>
  files: File[]
  removed_paths: string[]
  updated_at: string
}

/** A photo on its way to IndexedDB.
 *
 *  The filename and type are written out beside the bytes rather than trusted to survive the
 *  round trip. Not every engine clones a File as a File — several hand back a plain Blob and
 *  drop the name with it — and the name is what the storage path is built from, so losing it
 *  turns a recovered draft's photos into anonymous blobs. */
interface StoredFile {
  name: string
  type: string
  blob: Blob
}

const toStored = (f: File): StoredFile => ({ name: f.name, type: f.type, blob: f.slice() })

const fromStored = (s: StoredFile | File): File =>
  // Drafts written before this change hold real Files; if the engine kept the name, use it.
  s instanceof File ? s : new File([s.blob], s.name, { type: s.type })

export async function saveDraft(key: string, d: Omit<EntryDraft, 'updated_at'>): Promise<void> {
  const row = { ...d, files: d.files.map(toStored), updated_at: new Date().toISOString() }
  await set(key, row, store)
}

/** Restore a draft; stale drafts (>24h) are dropped so old junk never reappears. */
export async function loadDraft(key: string): Promise<EntryDraft | null> {
  const d = await get<Omit<EntryDraft, 'files'> & { files: (StoredFile | File)[] }>(key, store)
  if (!d) return null
  if (Date.now() - new Date(d.updated_at).getTime() > MAX_AGE_MS) {
    await del(key, store)
    return null
  }
  return { ...d, files: (d.files ?? []).map(fromStored) }
}

export async function clearDraft(key: string): Promise<void> {
  await del(key, store)
}

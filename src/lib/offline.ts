// Offline entry queue. When a new entry is saved without a connection it's stored
// in IndexedDB (photos included, as File blobs) and synced when back online.
import { del, get, keys, set, createStore } from 'idb-keyval'

const store = createStore('agrotop-wd', 'pending-entries')

export interface PendingEntry {
  id: string
  project_id: string
  values: Record<string, string>
  files: File[]
  created_at: string
}

export async function queueEntry(d: { project_id: string; values: Record<string, string>; files: File[] }): Promise<void> {
  const id = crypto.randomUUID()
  await set(id, { id, created_at: new Date().toISOString(), ...d } satisfies PendingEntry, store)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('wd-queued'))
}

export async function pendingCount(): Promise<number> {
  return (await keys(store)).length
}

export async function getPending(): Promise<PendingEntry[]> {
  const ks = await keys(store)
  const out: PendingEntry[] = []
  for (const k of ks) { const v = await get<PendingEntry>(k, store); if (v) out.push(v) }
  return out
}

/** Push queued entries to the server. Stops on the first failure (still offline). */
export async function syncQueue(
  create: (project_id: string, values: Record<string, string>, files: File[]) => Promise<unknown>,
): Promise<number> {
  const items = await getPending()
  let n = 0
  for (const it of items) {
    try {
      await create(it.project_id, it.values, it.files)
      await del(it.id, store)
      n++
    } catch {
      break // likely offline again — keep the rest for later
    }
  }
  return n
}

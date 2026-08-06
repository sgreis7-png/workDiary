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

// IndexedDB is unavailable in private mode on some browsers; a rejection here
// used to bubble out of the un-awaited `online`/`focus` handlers as an unhandled
// rejection and leave the pending badge stuck. Match the defects outbox and
// degrade to "nothing queued".
export async function pendingCount(): Promise<number> {
  try { return (await keys(store)).length } catch { return 0 }
}

export async function getPending(): Promise<PendingEntry[]> {
  try {
    const ks = await keys(store)
    const out: PendingEntry[] = []
    for (const k of ks) { const v = await get<PendingEntry>(k, store); if (v) out.push(v) }
    return out
  } catch { return [] }
}

// A sync can be triggered by the `online` event, window focus and mount at once.
// createEntry is not idempotent, so two overlapping runs would read the same
// pending row and post the entry twice — this guard serializes them.
let syncing: Promise<number> | null = null

/** Push queued entries to the server. Stops on the first failure (still offline). */
export function syncQueue(
  create: (project_id: string, values: Record<string, string>, files: File[]) => Promise<unknown>,
): Promise<number> {
  syncing ??= runSync(create).finally(() => { syncing = null })
  return syncing
}

async function runSync(
  create: (project_id: string, values: Record<string, string>, files: File[]) => Promise<unknown>,
): Promise<number> {
  // Replay order is not significant here: queued entries are independent
  // creates, unlike the defects outbox whose patch ops must apply in sequence.
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
  if (n && typeof window !== 'undefined') window.dispatchEvent(new Event('wd-queued'))
  return n
}

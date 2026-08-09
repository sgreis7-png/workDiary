// Offline entry queue. When a new entry is saved without a connection it's stored
// in IndexedDB (photos included, as File blobs) and synced when back online.
import { del, get, keys, set, createStore } from 'idb-keyval'
import { getOwner, ownedByCurrentUser } from './owner'

const store = createStore('agrotop-wd', 'pending-entries')

export interface PendingEntry {
  id: string
  project_id: string
  values: Record<string, string>
  files: File[]
  created_at: string
  /** Who queued it. IndexedDB is per-device, so without this the next person to sign
   *  in on a shared phone would upload this report under their own name. */
  owner?: string | null
}

export async function queueEntry(d: { project_id: string; values: Record<string, string>; files: File[] }): Promise<void> {
  const id = crypto.randomUUID()
  await set(id, { id, created_at: new Date().toISOString(), owner: getOwner(), ...d } satisfies PendingEntry, store)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('wd-queued'))
}

/** Drop every queued entry regardless of owner. Only for an explicit local wipe. */
export async function clearQueue(): Promise<void> {
  try { for (const k of await keys(store)) await del(k, store) } catch { /* private mode */ }
}

// IndexedDB is unavailable in private mode on some browsers; a rejection here
// used to bubble out of the un-awaited `online`/`focus` handlers as an unhandled
// rejection and leave the pending badge stuck. Match the defects outbox and
// degrade to "nothing queued".
export async function pendingCount(): Promise<number> {
  // only what the signed-in user can actually send, or the badge shows a number that
  // never goes down because it is counting somebody else's queued reports
  return (await getPending()).length
}

/** Queued rows belonging to somebody else, left alone until they sign in here again. */
export async function foreignPendingCount(): Promise<number> {
  try {
    const ks = await keys(store)
    let n = 0
    for (const k of ks) {
      const v = await get<PendingEntry>(k, store)
      if (v && !ownedByCurrentUser(v.owner)) n++
    }
    return n
  } catch { return 0 }
}

export async function getPending(): Promise<PendingEntry[]> {
  try {
    const ks = await keys(store)
    const out: PendingEntry[] = []
    for (const k of ks) {
      const v = await get<PendingEntry>(k, store)
      if (v && ownedByCurrentUser(v.owner)) out.push(v)
    }
    return out
  } catch { return [] }
}

// A sync can be triggered by the `online` event, window focus and mount at once. createEntry
// is idempotent now — the queue row's own id becomes the entry id — so a double run converges
// rather than posting twice. The guard stays: it saves the duplicated work, and it keeps the
// count the UI shows from jumping around.
let syncing: Promise<number> | null = null

/** Push queued entries to the server. Stops on the first failure (still offline). */
export function syncQueue(
  create: (project_id: string, values: Record<string, string>, files: File[], id?: string) => Promise<unknown>,
): Promise<number> {
  syncing ??= runSync(create).finally(() => { syncing = null })
  return syncing
}

async function runSync(
  create: (project_id: string, values: Record<string, string>, files: File[], id?: string) => Promise<unknown>,
): Promise<number> {
  // Replay order is not significant here: queued entries are independent
  // creates, unlike the defects outbox whose patch ops must apply in sequence.
  const items = await getPending()
  let n = 0
  for (const it of items) {
    try {
      // the queue row's id becomes the entry's id, so replaying this row twice — after a
      // partial upload, or from two overlapping syncs — finishes one entry instead of two
      await create(it.project_id, it.values, it.files, it.id)
      await del(it.id, store)
      n++
    } catch {
      break // likely offline again — keep the rest for later
    }
  }
  if (n && typeof window !== 'undefined') window.dispatchEvent(new Event('wd-queued'))
  return n
}

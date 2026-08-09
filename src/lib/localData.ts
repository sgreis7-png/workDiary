// Clearing this device's copy of the data when someone signs out.
//
// Signing out used to drop the Supabase session and nothing else, leaving the diary
// drafts, the QC read cache and — worst — the service worker's cache of authenticated
// REST responses on the device. Workbox keys that cache by URL, not by Authorization
// header, so the next person to sign in on a shared phone could be served the previous
// person's rows the moment the network went slow.
//
// What is NOT cleared: queued offline writes. Deleting a foreman's unsynced report to
// protect his privacy from his own colleague is a bad trade — the report is the work.
// Those rows carry an owner instead (src/lib/owner.ts) and can only ever replay for the
// person who made them. When the queues happen to be empty there is nothing to protect,
// so they go too.
import { del, keys, createStore } from 'idb-keyval'

import { clearQueue, pendingCount } from './offline'
import { clearDefectStores, outboxCount } from '../defects/offline'

const DRAFTS = createStore('agrotop-wd-drafts', 'entry-drafts')

/** Cache Storage buckets holding responses to authenticated requests. */
const AUTHED_CACHES = ['supabase-rest']

async function clearStore(store: ReturnType<typeof createStore>): Promise<void> {
  try {
    for (const k of await keys(store)) await del(k, store)
  } catch {
    /* IndexedDB is unavailable in private mode; nothing cached means nothing to clear */
  }
}

async function clearAuthedCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const names = await caches.keys()
    await Promise.all(
      names.filter((n) => AUTHED_CACHES.some((a) => n.includes(a))).map((n) => caches.delete(n)),
    )
  } catch {
    /* Cache Storage is unavailable or blocked */
  }
}

export interface PurgeResult {
  /** Queued writes left behind because they still hold unsent work. */
  keptPending: number
}

export async function purgeLocalData(): Promise<PurgeResult> {
  await clearStore(DRAFTS)
  await clearDefectStores()
  await clearAuthedCaches()

  const pending = (await pendingCount()) + (await outboxCount())
  if (pending === 0) await clearQueue()
  return { keptPending: pending }
}

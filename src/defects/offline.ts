// Offline support for the defects module: read-through cache for coops/bundles
// and a write outbox replayed when the connection returns. Field sites often
// have no reception — the checklist must keep working.
import { del, get, keys, set, createStore } from 'idb-keyval'
import { getOwner, ownedByCurrentUser } from '../lib/owner'

const cacheStore = createStore('agrotop-defects', 'cache')
const outboxStore = createStore('agrotop-defects', 'outbox')

// ---------- read cache ----------

export async function cachePut(key: string, value: unknown): Promise<void> {
  try { await set(key, value, cacheStore) } catch { /* private mode etc. */ }
}
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try { return await get<T>(key, cacheStore) } catch { return undefined }
}

// ---------- write outbox ----------

export type DefectOp =
  | { kind: 'item'; row: Record<string, unknown> }
  | { kind: 'resp'; row: Record<string, unknown> }
  | { kind: 'coop_patch'; id: string; patch: Record<string, unknown> }
  | { kind: 'defect_patch'; id: string; patch: Record<string, unknown> }
  | { kind: 'defect_create'; row: Record<string, unknown> }

/** `owner` scopes replay to whoever queued it — see src/lib/owner.ts. */
interface QueuedOp { id: string; seq: number; op: DefectOp; owner?: string | null }
let counter = Date.now()

// guarded like the diary queue's sibling: this module is also exercised outside
// a DOM (tests, and any future non-browser caller)
const notifyQueued = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('wd-queued'))
}

export async function queueOp(op: DefectOp): Promise<void> {
  const id = crypto.randomUUID()
  await set(id, { id, seq: ++counter, op, owner: getOwner() } satisfies QueuedOp, outboxStore)
  notifyQueued()
}

export async function outboxCount(): Promise<number> {
  // only the signed-in user's ops, so the pending badge reflects work they can send
  return (await ownOps()).length
}

async function ownOps(): Promise<QueuedOp[]> {
  try {
    const out: QueuedOp[] = []
    for (const k of await keys(outboxStore)) {
      const v = await get<QueuedOp>(k, outboxStore)
      if (v && ownedByCurrentUser(v.owner)) out.push(v)
    }
    return out
  } catch { return [] }
}

/** Drop the read cache and every queued op. Only for an explicit local wipe. */
export async function clearDefectStores(): Promise<void> {
  try {
    for (const k of await keys(cacheStore)) await del(k, cacheStore)
  } catch { /* private mode */ }
}

// Same guard as the diary queue (src/lib/offline.ts): `online`, window focus and
// mount can each trigger a replay. defect_create retries past duplicate-key
// collisions by bumping seq, so two overlapping replays would not error — they
// would silently create the defect twice.
let replaying: Promise<number> | null = null

/** Replay queued ops in order; stops at the first failure (still offline). */
export function replayOutbox(apply: (op: DefectOp) => Promise<void>): Promise<number> {
  replaying ??= runReplay(apply).finally(() => { replaying = null })
  return replaying
}

async function runReplay(apply: (op: DefectOp) => Promise<void>): Promise<number> {
  let items = await ownOps()
  items = items.sort((a, b) => a.seq - b.seq)
  let n = 0
  for (const it of items) {
    try {
      await apply(it.op)
      await del(it.id, outboxStore)
      n++
    } catch { break }
  }
  if (n) notifyQueued()
  return n
}

/** True when the failure is a connectivity problem worth queueing (not a data error). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = String((e as Error)?.message ?? e).toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')
}

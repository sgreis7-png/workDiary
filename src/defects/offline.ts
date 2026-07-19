// Offline support for the defects module: read-through cache for coops/bundles
// and a write outbox replayed when the connection returns. Field sites often
// have no reception — the checklist must keep working.
import { del, get, keys, set, createStore } from 'idb-keyval'

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

interface QueuedOp { id: string; seq: number; op: DefectOp }
let counter = Date.now()

export async function queueOp(op: DefectOp): Promise<void> {
  const id = crypto.randomUUID()
  await set(id, { id, seq: ++counter, op } satisfies QueuedOp, outboxStore)
  window.dispatchEvent(new Event('wd-queued'))
}

export async function outboxCount(): Promise<number> {
  try { return (await keys(outboxStore)).length } catch { return 0 }
}

/** Replay queued ops in order; stops at the first failure (still offline). */
export async function replayOutbox(apply: (op: DefectOp) => Promise<void>): Promise<number> {
  let items: QueuedOp[] = []
  try {
    const ks = await keys(outboxStore)
    for (const k of ks) { const v = await get<QueuedOp>(k, outboxStore); if (v) items.push(v) }
  } catch { return 0 }
  items = items.sort((a, b) => a.seq - b.seq)
  let n = 0
  for (const it of items) {
    try {
      await apply(it.op)
      await del(it.id, outboxStore)
      n++
    } catch { break }
  }
  if (n) window.dispatchEvent(new Event('wd-queued'))
  return n
}

/** True when the failure is a connectivity problem worth queueing (not a data error). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = String((e as Error)?.message ?? e).toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')
}

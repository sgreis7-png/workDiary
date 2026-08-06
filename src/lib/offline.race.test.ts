// Guards the offline queue against double-sending. `online`, window `focus` and
// mount can all fire a sync at once; createEntry is not idempotent, so two
// overlapping runs used to post the same queued entry twice.
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { queueEntry, pendingCount, syncQueue } from './offline'

describe('syncQueue concurrency', () => {
  // a no-op "upload" always succeeds, so this empties the queue between tests
  beforeEach(async () => { await syncQueue(async () => {}) })

  it('sends each queued entry exactly once when syncs overlap', async () => {
    await queueEntry({ project_id: 'p1', values: { a: '1' }, files: [] })
    await queueEntry({ project_id: 'p2', values: { a: '2' }, files: [] })

    const sent: string[] = []
    const create = async (project_id: string) => {
      // simulate a slow upload so the second caller starts mid-flight
      await new Promise((r) => setTimeout(r, 10))
      sent.push(project_id)
    }

    const [a, b] = await Promise.all([syncQueue(create), syncQueue(create)])

    expect(sent.sort()).toEqual(['p1', 'p2'])
    // both callers observe the same single run
    expect(a).toBe(2)
    expect(b).toBe(2)
    expect(await pendingCount()).toBe(0)
  })

  it('keeps unsent entries queued when the network fails mid-drain', async () => {
    await queueEntry({ project_id: 'ok', values: {}, files: [] })
    await queueEntry({ project_id: 'boom', values: {}, files: [] })

    let calls = 0
    const n = await syncQueue(async () => {
      calls++
      if (calls > 1) throw new Error('offline again')
    })

    expect(n).toBe(1)
    expect(await pendingCount()).toBe(1)
  })

  it('allows a fresh sync after the previous one settled', async () => {
    await syncQueue(async () => {})
    await queueEntry({ project_id: 'later', values: {}, files: [] })
    const n = await syncQueue(async () => {})
    expect(n).toBe(1)
  })
})

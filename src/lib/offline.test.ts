import { describe, it, expect, beforeEach } from 'vitest'
import { clear, createStore } from 'idb-keyval'
import { queueEntry, getPending, pendingCount, syncQueue } from './offline'

const store = createStore('agrotop-wd', 'pending-entries')
const draft = () => ({ project_id: 'p1', values: { site_location: 'כפר יובל' }, files: [] as File[] })

describe('offline entry queue', () => {
  beforeEach(async () => { await clear(store) })

  it('queues an entry and reports the count', async () => {
    expect(await pendingCount()).toBe(0)
    await queueEntry(draft())
    expect(await pendingCount()).toBe(1)
    const pend = await getPending()
    expect(pend[0].project_id).toBe('p1')
    expect(pend[0].values.site_location).toBe('כפר יובל')
    expect(pend[0].id).toBeTruthy()
  })

  it('syncs all queued entries and clears them on success', async () => {
    await queueEntry(draft())
    await queueEntry(draft())
    const seen: string[] = []
    const synced = await syncQueue(async (pid) => { seen.push(pid) })
    expect(synced).toBe(2)
    expect(seen).toEqual(['p1', 'p1'])
    expect(await pendingCount()).toBe(0)
  })

  it('keeps entries when sync fails (still offline)', async () => {
    await queueEntry(draft())
    await queueEntry(draft())
    const synced = await syncQueue(async () => { throw new Error('offline') })
    expect(synced).toBe(0)
    expect(await pendingCount()).toBe(2) // nothing lost
  })

  it('stops at the first failure, keeping the rest', async () => {
    await queueEntry(draft())
    await queueEntry(draft())
    let calls = 0
    const synced = await syncQueue(async () => { calls++; if (calls === 2) throw new Error('drop') })
    expect(synced).toBe(1)
    expect(await pendingCount()).toBe(1)
  })
})

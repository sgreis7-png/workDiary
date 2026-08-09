// The shared-device case: a foreman reports with no reception, hands the phone over, and
// a colleague signs in. His report must not upload under their name.
import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'

import { deviceHasOneAccount, getOwner, ownedByCurrentUser, setOwner } from './owner'
import { clearQueue, getPending, pendingCount, foreignPendingCount, queueEntry, syncQueue } from './offline'

const entry = (project: string) => ({ project_id: project, values: { daily_content: project }, files: [] })

describe('owner', () => {
  beforeEach(() => setOwner(null))

  it('normalizes to a lower-cased email', () => {
    setOwner('  Foreman@Agrotop.co.il ')
    expect(getOwner()).toBe('foreman@agrotop.co.il')
  })

  it('is null when signed out', () => {
    setOwner(undefined)
    expect(getOwner()).toBeNull()
  })

  it('claims rows written before the field existed', () => {
    // refusing them outright would strand real unsynced work with no way to ever send it
    setOwner('someone@agrotop.co.il')
    expect(ownedByCurrentUser(undefined)).toBe(true)
    expect(ownedByCurrentUser(null)).toBe(true)
  })

  it('stops claiming ownerless rows once a second account has used the device', () => {
    // The ownerless case is only unambiguous on a phone one person uses. Needs a real
    // localStorage: the module keeps the accounts it has seen there, and the test environment
    // has none, which is why the case above reads as a single-account device.
    const mem = new Map<string, string>()
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v) },
      removeItem: (k: string) => { mem.delete(k) },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    }
    const g = globalThis as { localStorage?: Storage }
    const had = g.localStorage
    g.localStorage = store as unknown as Storage
    try {
      setOwner('a@agrotop.co.il')
      expect(ownedByCurrentUser(undefined)).toBe(true) // still the only account here

      setOwner('b@agrotop.co.il')
      expect(deviceHasOneAccount()).toBe(false)
      // b must not inherit whatever a left queued before the field existed
      expect(ownedByCurrentUser(undefined)).toBe(false)
      expect(ownedByCurrentUser(null)).toBe(false)
      // and their own rows still work
      expect(ownedByCurrentUser('b@agrotop.co.il')).toBe(true)

      // a comes back: the device has seen two accounts, so ownerless stays ambiguous
      setOwner('a@agrotop.co.il')
      expect(ownedByCurrentUser(undefined)).toBe(false)
    } finally {
      if (had) g.localStorage = had
      else delete g.localStorage
    }
  })

  it('refuses another account, including when signed out', () => {
    setOwner('b@agrotop.co.il')
    expect(ownedByCurrentUser('a@agrotop.co.il')).toBe(false)
    setOwner(null)
    expect(ownedByCurrentUser('a@agrotop.co.il')).toBe(false)
  })
})

describe('offline queue ownership', () => {
  beforeEach(async () => {
    setOwner(null)
    await clearQueue()
  })

  it('stamps the queueing user on the row', async () => {
    setOwner('a@agrotop.co.il')
    await queueEntry(entry('p1'))
    expect((await getPending())[0].owner).toBe('a@agrotop.co.il')
  })

  it('hides another user\'s queued work and counts it separately', async () => {
    setOwner('a@agrotop.co.il')
    await queueEntry(entry('p1'))

    setOwner('b@agrotop.co.il')
    expect(await getPending()).toEqual([])
    expect(await pendingCount()).toBe(0)
    expect(await foreignPendingCount()).toBe(1)
  })

  it('never replays another user\'s entry, and does not destroy it', async () => {
    setOwner('a@agrotop.co.il')
    await queueEntry(entry('p1'))

    setOwner('b@agrotop.co.il')
    const sent: string[] = []
    const n = await syncQueue(async (project_id) => { sent.push(project_id) })
    expect(n).toBe(0)
    expect(sent).toEqual([])

    // still there for its owner when they sign back in on this device
    setOwner('a@agrotop.co.il')
    expect(await pendingCount()).toBe(1)
    expect(await syncQueue(async (project_id) => { sent.push(project_id) })).toBe(1)
    expect(sent).toEqual(['p1'])
  })

  it('replays its own work normally', async () => {
    setOwner('a@agrotop.co.il')
    await queueEntry(entry('p1'))
    await queueEntry(entry('p2'))
    const sent: string[] = []
    expect(await syncQueue(async (project_id) => { sent.push(project_id) })).toBe(2)
    expect(sent.sort()).toEqual(['p1', 'p2'])
    expect(await pendingCount()).toBe(0)
  })
})

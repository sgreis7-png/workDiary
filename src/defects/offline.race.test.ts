// The defects outbox is replayed from the same triggers as the diary queue
// (online / focus / mount). defect_create retries past duplicate-key collisions
// by bumping seq, so overlapping replays would not error — they would silently
// create the same defect twice.
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { queueOp, outboxCount, replayOutbox, type DefectOp } from './offline'

const op = (tag: string): DefectOp => ({ kind: 'defect_create', row: { description: tag } })
const tagOf = (o: DefectOp) => String((o as { row: Record<string, unknown> }).row.description)

describe('replayOutbox concurrency', () => {
  beforeEach(async () => { await replayOutbox(async () => {}) })

  it('applies each queued op exactly once when replays overlap', async () => {
    await queueOp(op('c1'))
    await queueOp(op('c2'))

    const applied: string[] = []
    const apply = async (o: DefectOp) => {
      await new Promise((r) => setTimeout(r, 10))
      applied.push(tagOf(o))
    }

    const [a, b] = await Promise.all([replayOutbox(apply), replayOutbox(apply)])

    expect(applied.sort()).toEqual(['c1', 'c2'])
    expect(a).toBe(2)
    expect(b).toBe(2)
    expect(await outboxCount()).toBe(0)
  })

  it('leaves the remaining ops queued when one fails', async () => {
    await queueOp(op('ok'))
    await queueOp(op('boom'))

    let calls = 0
    const n = await replayOutbox(async () => {
      calls++
      if (calls > 1) throw new Error('offline again')
    })

    expect(n).toBe(1)
    expect(await outboxCount()).toBe(1)
  })
})

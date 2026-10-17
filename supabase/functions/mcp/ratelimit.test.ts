import { describe, it, expect } from 'vitest'
import { makeLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from './ratelimit'

// Without a per-user limit, one looping chat session can run unbounded tool calls against the
// press-history and diary tables, so these tests pin the bucket behaviour the connector relies on.
describe('claude connector per-user rate limit', () => {
  it('uses the agreed defaults', () => {
    expect(DEFAULT_CAPACITY).toBe(60)
    expect(DEFAULT_REFILL_PER_SEC).toBe(1)
  })

  it('allows capacity then refuses', () => {
    let t = 0
    const allow = makeLimiter({ capacity: 3, refillPerSec: 1, now: () => t })
    expect([allow('u'), allow('u'), allow('u'), allow('u')]).toEqual([true, true, true, false])
  })

  it('refills over time', () => {
    let t = 0
    const allow = makeLimiter({ capacity: 2, refillPerSec: 1, now: () => t })
    expect(allow('u')).toBe(true)
    expect(allow('u')).toBe(true)
    expect(allow('u')).toBe(false)
    t += 999
    expect(allow('u')).toBe(false)
    t += 1
    expect(allow('u')).toBe(true)
    expect(allow('u')).toBe(false)
  })

  it('refill never exceeds capacity', () => {
    let t = 0
    const allow = makeLimiter({ capacity: 2, refillPerSec: 1, now: () => t })
    expect(allow('u')).toBe(true)
    t += 60_000
    expect([allow('u'), allow('u'), allow('u')]).toEqual([true, true, false])
  })

  it('keys are independent', () => {
    let t = 0
    const allow = makeLimiter({ capacity: 1, refillPerSec: 0, now: () => t })
    expect(allow('a')).toBe(true)
    expect(allow('a')).toBe(false)
    expect(allow('b')).toBe(true)
  })

  it('evicts the oldest key once the map is full, so memory stays bounded', () => {
    let t = 0
    const allow = makeLimiter({ capacity: 1, refillPerSec: 0, now: () => t })
    expect(allow('first')).toBe(true)
    expect(allow('first')).toBe(false)
    for (let i = 0; i < 10_000; i++) allow(`k${i}`)
    // 'first' was evicted, so it starts over with a full bucket.
    expect(allow('first')).toBe(true)
  })
})

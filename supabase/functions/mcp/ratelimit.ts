// Per-user token bucket for the Claude connector. Each key (a user id) gets `capacity` tokens and
// earns `refillPerSec` back per second, up to capacity. A call takes one token or is refused.
//
// Deno-safe on purpose: no imports. The Map is capped so a stream of distinct keys cannot grow
// memory without limit; the oldest key is dropped first (Map keeps insertion order).

export const DEFAULT_CAPACITY = 60
export const DEFAULT_REFILL_PER_SEC = 1

/** Upper bound on tracked keys. Past this the oldest bucket is forgotten (its user starts full again). */
const MAX_KEYS = 10_000

type Bucket = { tokens: number; last: number }

export function makeLimiter(opts: {
  capacity: number
  refillPerSec: number
  now?: () => number
}): (key: string) => boolean {
  const { capacity, refillPerSec } = opts
  const now = opts.now ?? Date.now
  const buckets = new Map<string, Bucket>()

  return (key: string): boolean => {
    const t = now()
    let b = buckets.get(key)
    if (!b) {
      if (buckets.size >= MAX_KEYS) buckets.delete(buckets.keys().next().value as string)
      b = { tokens: capacity, last: t }
      buckets.set(key, b)
    }
    const earned = ((t - b.last) / 1000) * refillPerSec
    b.tokens = Math.min(capacity, b.tokens + Math.max(0, earned))
    b.last = t
    if (b.tokens >= 1) {
      b.tokens -= 1
      return true
    }
    return false
  }
}

/**
 * Small in-memory fixed-window rate limiter.
 *
 * NOTE: state lives in process memory. Limits are per-process: they reset on
 * restart and are not shared across multiple instances. Good enough as a
 * brute-force speed bump; use a shared store if you scale out.
 *
 * Use `consume` to check and count in one synchronous step, before any
 * `await`: a separate check-then-record lets parallel requests all pass the
 * check before any of them is counted.
 */
export interface RateLimiterOptions {
  max: number
  windowMs: number
  now?: () => number
}

export interface RateLimiter {
  /** True when the key has reached `max` recorded hits in the current window. */
  isLimited: (key: string) => boolean
  /**
   * Atomically check and count one hit. Returns true (and counts it) when the
   * key is under `max`; returns false (and counts nothing) when it is limited.
   */
  consume: (key: string) => boolean
  /** Record one hit unconditionally. Returns the count in the window. */
  record: (key: string) => number
  /** Give back one previously consumed hit (e.g. the attempt turned out to succeed). */
  refund: (key: string) => void
  reset: (key: string) => void
  /** Number of tracked keys (for tests/diagnostics). */
  size: () => number
}

export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>()
  let lastPrune = now()

  const prune = (t: number) => {
    if (t - lastPrune < windowMs) return
    lastPrune = t
    for (const [key, v] of hits) if (v.resetAt <= t) hits.delete(key)
  }

  const live = (key: string, t: number) => {
    const v = hits.get(key)
    if (v && v.resetAt <= t) {
      hits.delete(key)
      return undefined
    }
    return v
  }

  const record = (key: string, t: number) => {
    const v = live(key, t)
    if (v) {
      v.count += 1
      return v.count
    }
    hits.set(key, { count: 1, resetAt: t + windowMs })
    return 1
  }

  return {
    isLimited(key) {
      const t = now()
      prune(t)
      return (live(key, t)?.count ?? 0) >= max
    },
    consume(key) {
      const t = now()
      prune(t)
      if ((live(key, t)?.count ?? 0) >= max) return false
      record(key, t)
      return true
    },
    record(key) {
      const t = now()
      prune(t)
      return record(key, t)
    },
    refund(key) {
      const v = live(key, now())
      if (!v) return
      v.count -= 1
      if (v.count <= 0) hits.delete(key)
    },
    reset(key) {
      hits.delete(key)
    },
    size() {
      return hits.size
    },
  }
}

/**
 * Consume one hit from each (limiter, key) pair, all or nothing. Synchronous,
 * so it is atomic with respect to other requests in this process. Returns
 * false, with nothing counted, when any pair is limited.
 */
export function consumeAll(pairs: ReadonlyArray<readonly [RateLimiter, string]>): boolean {
  for (let i = 0; i < pairs.length; i++) {
    const [limiter, key] = pairs[i]
    if (!limiter.consume(key)) {
      for (let j = 0; j < i; j++) pairs[j][0].refund(pairs[j][1])
      return false
    }
  }
  return true
}

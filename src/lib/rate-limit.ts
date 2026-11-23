/**
 * Small in-memory fixed-window rate limiter.
 *
 * NOTE: state lives in process memory. Limits are per-process: they reset on
 * restart and are not shared across multiple instances. Good enough as a
 * brute-force speed bump; use a shared store if you scale out.
 */
export interface RateLimiterOptions {
  max: number
  windowMs: number
  now?: () => number
}

export interface RateLimiter {
  /** True when the key has reached `max` recorded hits in the current window. */
  isLimited: (key: string) => boolean
  /** Record one hit (e.g. a failed attempt). Returns the count in the window. */
  record: (key: string) => number
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

  return {
    isLimited(key) {
      const t = now()
      prune(t)
      return (live(key, t)?.count ?? 0) >= max
    },
    record(key) {
      const t = now()
      prune(t)
      const v = live(key, t)
      if (v) {
        v.count += 1
        return v.count
      }
      hits.set(key, { count: 1, resetAt: t + windowMs })
      return 1
    },
    reset(key) {
      hits.delete(key)
    },
    size() {
      return hits.size
    },
  }
}

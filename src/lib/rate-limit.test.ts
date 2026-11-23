import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('limits after max hits and expires after the window', () => {
    let t = 0
    const rl = createRateLimiter({ max: 3, windowMs: 1000, now: () => t })
    rl.record('a')
    rl.record('a')
    expect(rl.isLimited('a')).toBe(false)
    rl.record('a')
    expect(rl.isLimited('a')).toBe(true)
    expect(rl.isLimited('b')).toBe(false)
    t = 1000
    expect(rl.isLimited('a')).toBe(false)
  })

  it('reset clears a key', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    rl.record('a')
    expect(rl.isLimited('a')).toBe(true)
    rl.reset('a')
    expect(rl.isLimited('a')).toBe(false)
  })

  it('prunes expired keys', () => {
    let t = 0
    const rl = createRateLimiter({ max: 5, windowMs: 1000, now: () => t })
    for (let i = 0; i < 100; i++) rl.record(`k${i}`)
    expect(rl.size()).toBe(100)
    t = 5000
    rl.isLimited('x')
    expect(rl.size()).toBe(0)
  })
})

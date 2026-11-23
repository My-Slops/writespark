import { describe, expect, it } from 'vitest'
import { consumeAll, createRateLimiter } from './rate-limit'

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

  it('consume counts allowed hits and refuses (without counting) once limited', () => {
    let t = 0
    const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    expect(rl.consume('a')).toBe(true)
    expect(rl.consume('a')).toBe(true)
    expect(rl.consume('a')).toBe(false)
    expect(rl.consume('a')).toBe(false)
    expect(rl.consume('b')).toBe(true)
    t = 999
    expect(rl.consume('a')).toBe(false)
    t = 1000
    expect(rl.consume('a')).toBe(true)
  })

  it('allows exactly max of a synchronous burst (parallel requests before any await)', () => {
    const rl = createRateLimiter({ max: 10, windowMs: 60_000, now: () => 0 })
    const results = Array.from({ length: 20 }, () => rl.consume('victim@example.com'))
    expect(results.filter(Boolean)).toHaveLength(10)
    expect(results.slice(0, 10).every(Boolean)).toBe(true)
  })

  it('refund gives back one hit and drops the key at zero', () => {
    const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => 0 })
    rl.consume('a')
    rl.consume('a')
    expect(rl.isLimited('a')).toBe(true)
    rl.refund('a')
    expect(rl.isLimited('a')).toBe(false)
    rl.refund('a')
    expect(rl.size()).toBe(0)
    rl.refund('a')
    expect(rl.size()).toBe(0)
  })

  it('refund after the window expired does nothing', () => {
    let t = 0
    const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    rl.consume('a')
    t = 2000
    rl.refund('a')
    expect(rl.consume('a')).toBe(true)
    expect(rl.consume('a')).toBe(true)
    expect(rl.consume('a')).toBe(false)
  })
})

describe('consumeAll', () => {
  it('consumes from every limiter when all allow', () => {
    const a = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    const b = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    expect(consumeAll([[a, 'x'], [b, 'y']])).toBe(true)
    expect(a.isLimited('x')).toBe(true)
    expect(b.isLimited('y')).toBe(true)
  })

  it('counts nothing when any limiter refuses', () => {
    const a = createRateLimiter({ max: 5, windowMs: 1000, now: () => 0 })
    const b = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    b.consume('y')
    expect(consumeAll([[a, 'x'], [b, 'y']])).toBe(false)
    expect(a.size()).toBe(0)
  })

  it('caps a mixed burst at the tightest limit', () => {
    const perPair = createRateLimiter({ max: 3, windowMs: 1000, now: () => 0 })
    const perIp = createRateLimiter({ max: 30, windowMs: 1000, now: () => 0 })
    const results = Array.from({ length: 10 }, () => consumeAll([[perIp, '1.2.3.4'], [perPair, 'e|1.2.3.4']]))
    expect(results.filter(Boolean)).toHaveLength(3)
    // Refused attempts are not charged to the looser limiter.
    for (let i = 0; i < 27; i++) expect(perIp.consume('1.2.3.4')).toBe(true)
    expect(perIp.consume('1.2.3.4')).toBe(false)
  })
})

import { randomBytes, scryptSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('round-trips', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
    expect(await verifyPassword('correct horse', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse')
    expect(await verifyPassword('wrong horse', hash)).toBe(false)
  })

  it('returns false for malformed hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'nocolon')).toBe(false)
    expect(await verifyPassword('x', 'salt:zzzz')).toBe(false)
    expect(await verifyPassword('x', 'salt:abcd')).toBe(false)
    expect(await verifyPassword('x', 'a:b:c')).toBe(false)
  })

  it('verifies a hash produced by the legacy sync implementation', async () => {
    const salt = randomBytes(16).toString('hex')
    const legacy = `${salt}:${scryptSync('legacy-pass', salt, 64).toString('hex')}`
    expect(await verifyPassword('legacy-pass', legacy)).toBe(true)
    expect(await verifyPassword('other', legacy)).toBe(false)
  })
})

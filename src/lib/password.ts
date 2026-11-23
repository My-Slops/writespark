import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>

const KEY_LENGTH = 64

/** Hash a password with async scrypt. Format: `<salt hex>:<hash hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(password, salt, KEY_LENGTH)
  return `${salt}:${derived.toString('hex')}`
}

/** Verify a password against a stored hash. Returns false (never throws) on malformed hashes. */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const parts = passwordHash.split(':')
  if (parts.length !== 2) return false
  const [salt, storedHex] = parts
  if (!salt || !storedHex || !/^[0-9a-f]+$/i.test(storedHex) || storedHex.length % 2 !== 0) return false
  const stored = Buffer.from(storedHex, 'hex')
  if (stored.length !== KEY_LENGTH) return false
  const derived = await scryptAsync(password, salt, KEY_LENGTH)
  return timingSafeEqual(stored, derived)
}

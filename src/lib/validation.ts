import { z } from 'zod'
import { CONFIG } from './config'

/**
 * Shared input validators for server functions.
 *
 * Device IDs are generated client-side as `guest_` + 32 lowercase hex chars
 * (a UUIDv4 without dashes, ~122 bits of randomness). Enforcing the exact
 * format server-side rejects weak/hand-picked IDs, and guarantees that
 * server-generated account identities (`account_<uuid>`) can never be
 * addressed through a device ID.
 */
export const DEVICE_ID_RE = /^guest_[0-9a-f]{32}$/

export const deviceIdSchema = z.string().regex(DEVICE_ID_RE, 'Invalid device id.')

export const sessionTokenSchema = z.string().min(CONFIG.SESSION_TOKEN_MIN_LENGTH).max(256)

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export const timezoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, 'Invalid IANA timezone.')

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** True only for real calendar dates in YYYY-MM-DD form (rejects 2026-02-30). */
export function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export const isoDateSchema = z.string().refine(isRealIsoDate, 'Date must be a real date in YYYY-MM-DD format.')

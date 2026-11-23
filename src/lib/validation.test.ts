import { describe, expect, it } from 'vitest'
import { deviceIdSchema, isRealIsoDate, isValidTimeZone } from './validation'

describe('validation', () => {
  it('accepts IANA time zone names', () => {
    for (const tz of ['UTC', 'America/Toronto', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Etc/GMT+12', 'Etc/GMT-14', 'America/Argentina/Buenos_Aires']) {
      expect(isValidTimeZone(tz)).toBe(true)
    }
  })

  it('rejects raw offsets and junk', () => {
    for (const tz of ['+23:59', '-23:59', '+05:30', '05:30', '', 'Not/A_Zone', 'UTC; DROP']) {
      expect(isValidTimeZone(tz)).toBe(false)
    }
  })

  it('accepts only real calendar dates', () => {
    expect(isRealIsoDate('2026-02-28')).toBe(true)
    expect(isRealIsoDate('2028-02-29')).toBe(true)
    expect(isRealIsoDate('2026-02-30')).toBe(false)
    expect(isRealIsoDate('2026-2-3')).toBe(false)
  })

  it('accepts only generated device ids', () => {
    expect(deviceIdSchema.safeParse(`guest_${'a'.repeat(32)}`).success).toBe(true)
    expect(deviceIdSchema.safeParse(`account_${'a'.repeat(32)}`).success).toBe(false)
    expect(deviceIdSchema.safeParse('guest_short').success).toBe(false)
  })
})

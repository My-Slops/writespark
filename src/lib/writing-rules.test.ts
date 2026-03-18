import { describe, expect, it } from 'vitest'
import {
  assertTodayLocalConsistent,
  countWords,
  isDateLocked,
  localDateForInstant,
} from './writing-rules'

describe('writing rules', () => {
  it('counts words from plain text', () => {
    expect(countWords('hello world from writespark')).toBe(4)
  })

  it('ignores extra whitespace', () => {
    expect(countWords('  hello   world  ')).toBe(2)
  })

  it('locks non-today dates', () => {
    expect(isDateLocked('2026-03-17', '2026-03-18')).toBe(true)
    expect(isDateLocked('2026-03-18', '2026-03-18')).toBe(false)
  })

  it('derives local date by timezone from an instant', () => {
    const instant = '2026-03-18T03:30:00.000Z'
    expect(localDateForInstant(instant, 'America/Toronto')).toBe('2026-03-17')
    expect(localDateForInstant(instant, 'UTC')).toBe('2026-03-18')
  })

  it('accepts consistent todayLocal values', () => {
    expect(() =>
      assertTodayLocalConsistent({
        todayLocal: '2026-03-17',
        timezone: 'America/Toronto',
        clientNowIso: '2026-03-18T03:30:00.000Z',
      }),
    ).not.toThrow()
  })

  it('rejects inconsistent todayLocal values', () => {
    expect(() =>
      assertTodayLocalConsistent({
        todayLocal: '2026-03-18',
        timezone: 'America/Toronto',
        clientNowIso: '2026-03-18T03:30:00.000Z',
      }),
    ).toThrow(/does not match/)
  })
})

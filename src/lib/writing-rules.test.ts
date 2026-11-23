import { describe, expect, it } from 'vitest'
import { countWords, epochDay, isDateLocked, localDateForInstant, serverTodayFor } from './writing-rules'

describe('writing rules', () => {
  it('counts words from plain text', () => {
    expect(countWords('hello world from writespark')).toBe(4)
  })

  it('ignores extra whitespace', () => {
    expect(countWords('  hello   world  ')).toBe(2)
  })

  it('counts blank content as zero words', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  \n\t ')).toBe(0)
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

  it('derives server today per timezone from a fixed now', () => {
    const now = new Date('2026-03-18T03:30:00.000Z')
    expect(serverTodayFor('America/Toronto', now)).toBe('2026-03-17')
    expect(serverTodayFor('UTC', now)).toBe('2026-03-18')
    expect(serverTodayFor('Pacific/Kiritimati', now)).toBe('2026-03-18')
    expect(serverTodayFor('Pacific/Pago_Pago', now)).toBe('2026-03-17')
  })

  it('defaults serverTodayFor to the current instant', () => {
    expect(serverTodayFor('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('computes epoch days', () => {
    expect(epochDay('1970-01-01')).toBe(0)
    expect(epochDay('1970-01-02')).toBe(1)
    expect(epochDay('1969-12-31')).toBe(-1)
  })
})

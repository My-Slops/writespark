import { describe, expect, it } from 'vitest'
import {
  MERGE_SEPARATOR,
  appendGuestContent,
  countWords,
  epochDay,
  isDateLocked,
  localDateForInstant,
  serverTodayFor,
} from './writing-rules'

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

  describe('appendGuestContent', () => {
    it('appends guest text after the account text with a separator', () => {
      expect(appendGuestContent('account words', 'guest words')).toBe('account words\n\n---\n\nguest words')
      expect(MERGE_SEPARATOR).toBe('\n\n---\n\n')
    })

    it('keeps both texts verbatim (no trimming of either side)', () => {
      expect(appendGuestContent('line one\n', '  indented')).toBe('line one\n' + MERGE_SEPARATOR + '  indented')
    })

    it('appends even when the result exceeds the word limit', () => {
      const account = Array.from({ length: 2990 }, () => 'a').join(' ')
      const guest = Array.from({ length: 50 }, () => 'g').join(' ')
      const merged = appendGuestContent(account, guest)
      expect(countWords(merged)).toBe(2990 + 50 + 1) // "---" counts as a word
      expect(merged.endsWith(guest)).toBe(true)
    })

    it('leaves the account text unchanged for blank or identical guest text', () => {
      expect(appendGuestContent('account', '   \n')).toBe('account')
      expect(appendGuestContent('same text', 'same text\n')).toBe('same text')
    })

    it('uses the guest text alone when the account text is blank', () => {
      expect(appendGuestContent('  ', 'guest')).toBe('guest')
    })
  })
})

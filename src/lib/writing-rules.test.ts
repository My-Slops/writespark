import { describe, expect, it } from 'vitest'
import { countWords, isDateLocked } from './writing-rules'

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
})

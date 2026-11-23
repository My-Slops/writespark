import { describe, expect, it } from 'vitest'
import { computeStreaks, determineNewBadges } from './badge-engine'

const e = (promptDate: string, wordCount = 10) => ({ promptDate, wordCount })

describe('badge engine', () => {
  it('computes current and longest streak', () => {
    const entries = [e('2026-03-01'), e('2026-03-02'), e('2026-03-03'), e('2026-03-10'), e('2026-03-11')]
    expect(computeStreaks(entries, '2026-03-11')).toEqual({ currentStreak: 2, longestStreak: 3 })
  })

  it('resets current streak when the last entry is stale but keeps longest', () => {
    const entries = [e('2026-03-01'), e('2026-03-02'), e('2026-03-03')]
    expect(computeStreaks(entries, '2026-03-20')).toEqual({ currentStreak: 0, longestStreak: 3 })
  })

  it('still counts the streak when the latest entry is yesterday', () => {
    const entries = [e('2026-03-08'), e('2026-03-09')]
    expect(computeStreaks(entries, '2026-03-10')).toEqual({ currentStreak: 2, longestStreak: 2 })
  })

  it('counts the streak when the latest entry is today', () => {
    expect(computeStreaks([e('2026-03-10')], '2026-03-10')).toEqual({ currentStreak: 1, longestStreak: 1 })
  })

  it('is 0 when the latest entry is two days ago', () => {
    expect(computeStreaks([e('2026-03-08')], '2026-03-10')).toEqual({ currentStreak: 0, longestStreak: 1 })
  })

  it('ignores 0-word entries', () => {
    const entries = [e('2026-03-08'), e('2026-03-09', 0), e('2026-03-10')]
    expect(computeStreaks(entries, '2026-03-10')).toEqual({ currentStreak: 1, longestStreak: 1 })
    expect(computeStreaks([e('2026-03-10', 0)], '2026-03-10')).toEqual({ currentStreak: 0, longestStreak: 0 })
  })

  it('does not double count duplicate dates', () => {
    const entries = [e('2026-03-09'), e('2026-03-09'), e('2026-03-10')]
    expect(computeStreaks(entries, '2026-03-10')).toEqual({ currentStreak: 2, longestStreak: 2 })
  })

  it('returns zeros for no entries', () => {
    expect(computeStreaks([], '2026-03-10')).toEqual({ currentStreak: 0, longestStreak: 0 })
  })

  it('awards milestone badges from totals, streaks, and single-entry thresholds', () => {
    const entries = Array.from({ length: 30 }, (_, i) => e(`2026-03-${String(i + 1).padStart(2, '0')}`, 350))

    const badges = determineNewBadges({
      entries,
      latestWordCount: 2100,
      alreadyAwarded: new Set<string>(),
      today: '2026-03-30',
    })

    expect(badges).toEqual(
      expect.arrayContaining([
        'first_entry',
        'streak_7',
        'streak_10',
        'single_1000',
        'single_2000',
        'total_5000',
        'total_10000',
        'entries_30',
      ]),
    )
  })

  it('does not award streak badges from a stale streak', () => {
    const entries = Array.from({ length: 10 }, (_, i) => e(`2026-03-${String(i + 1).padStart(2, '0')}`, 50))
    const badges = determineNewBadges({
      entries,
      latestWordCount: 50,
      alreadyAwarded: new Set<string>(),
      today: '2026-04-30',
    })
    expect(badges).not.toContain('streak_7')
    expect(badges).not.toContain('streak_10')
  })

  it('does not award first_entry for only 0-word entries', () => {
    const badges = determineNewBadges({
      entries: [e('2026-03-01', 0)],
      latestWordCount: 0,
      alreadyAwarded: new Set<string>(),
      today: '2026-03-01',
    })
    expect(badges).toEqual([])
  })

  it('does not re-award existing badges', () => {
    const badges = determineNewBadges({
      entries: [e('2026-03-01', 2000)],
      latestWordCount: 2000,
      alreadyAwarded: new Set(['first_entry', 'single_1000']),
      today: '2026-03-01',
    })

    expect(badges).not.toContain('first_entry')
    expect(badges).toContain('single_2000')
  })
})

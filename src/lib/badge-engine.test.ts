import { describe, expect, it } from 'vitest'
import { computeStreaks, determineNewBadges } from './badge-engine'

describe('badge engine', () => {
  it('computes current and longest streak', () => {
    const entries = [
      { promptDate: '2026-03-01', wordCount: 10 },
      { promptDate: '2026-03-02', wordCount: 20 },
      { promptDate: '2026-03-03', wordCount: 30 },
      { promptDate: '2026-03-10', wordCount: 30 },
      { promptDate: '2026-03-11', wordCount: 30 },
    ]

    expect(computeStreaks(entries)).toEqual({ currentStreak: 2, longestStreak: 3 })
  })

  it('awards milestone badges from totals, streaks, and single-entry thresholds', () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({
      promptDate: `2026-03-${String(i + 1).padStart(2, '0')}`,
      wordCount: 350,
    }))

    const badges = determineNewBadges({
      entries,
      latestWordCount: 2100,
      alreadyAwarded: new Set<string>(),
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

  it('does not re-award existing badges', () => {
    const entries = [{ promptDate: '2026-03-01', wordCount: 2000 }]
    const badges = determineNewBadges({
      entries,
      latestWordCount: 2000,
      alreadyAwarded: new Set(['first_entry', 'single_1000']),
    })

    expect(badges).not.toContain('first_entry')
    expect(badges).toContain('single_2000')
  })
})

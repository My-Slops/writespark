export type ProgressEntry = {
  promptDate: string
  wordCount: number
}

export type BadgeKey =
  | 'first_entry'
  | 'streak_7'
  | 'streak_10'
  | 'single_1000'
  | 'single_2000'
  | 'total_5000'
  | 'total_10000'
  | 'entries_30'

function toEpochDay(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

export function computeStreaks(entries: ProgressEntry[]) {
  if (entries.length === 0) return { currentStreak: 0, longestStreak: 0 }

  const sorted = [...entries].sort((a, b) => a.promptDate.localeCompare(b.promptDate))

  let longestStreak = 1
  let running = 1
  for (let i = 1; i < sorted.length; i++) {
    const diff = toEpochDay(sorted[i].promptDate) - toEpochDay(sorted[i - 1].promptDate)
    if (diff === 1) {
      running += 1
      longestStreak = Math.max(longestStreak, running)
    } else if (diff > 1) {
      running = 1
    }
  }

  let currentStreak = 1
  for (let i = sorted.length - 1; i > 0; i--) {
    const diff = toEpochDay(sorted[i].promptDate) - toEpochDay(sorted[i - 1].promptDate)
    if (diff === 1) currentStreak += 1
    else break
  }

  return { currentStreak, longestStreak }
}

export function determineNewBadges(input: {
  entries: ProgressEntry[]
  latestWordCount: number
  alreadyAwarded: Set<string>
}): BadgeKey[] {
  const { entries, latestWordCount, alreadyAwarded } = input
  const totalEntries = entries.length
  const totalWords = entries.reduce((acc, e) => acc + e.wordCount, 0)
  const { currentStreak } = computeStreaks(entries)

  const result: BadgeKey[] = []

  const maybe = (key: BadgeKey, condition: boolean) => {
    if (condition && !alreadyAwarded.has(key)) result.push(key)
  }

  maybe('first_entry', totalEntries >= 1)
  maybe('streak_7', currentStreak >= 7)
  maybe('streak_10', currentStreak >= 10)
  maybe('single_1000', latestWordCount >= 1000)
  maybe('single_2000', latestWordCount >= 2000)
  maybe('total_5000', totalWords >= 5000)
  maybe('total_10000', totalWords >= 10000)
  maybe('entries_30', totalEntries >= 30)

  return result
}

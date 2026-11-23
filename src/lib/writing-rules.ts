const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function countWords(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length
}

export function isDateLocked(localDate: string, todayLocal: string) {
  return localDate !== todayLocal
}

export function assertIsoDate(date: string, fieldName: string) {
  if (!DATE_RE.test(date)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`)
  }
}

export function localDateForInstant(instantIso: string, timezone: string) {
  const instant = new Date(instantIso)
  if (Number.isNaN(instant.getTime())) {
    throw new Error('instant must be a valid ISO timestamp.')
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/**
 * The server-trusted "today" (YYYY-MM-DD) in the given IANA timezone.
 *
 * Trade-off (accepted): the client still chooses its timezone, so a caller can
 * only ever write to a date that is "today" somewhere on Earth, i.e. at most
 * +/- 1 day from the server's UTC date. Past days beyond that stay locked.
 *
 * Note: the `entries.locked` column is not authoritative; lock state is
 * derived on read as `localDate !== serverTodayFor(timezone)`.
 */
export function serverTodayFor(timezone: string, now: Date = new Date()): string {
  return localDateForInstant(now.toISOString(), timezone)
}

/** Days since 1970-01-01 UTC for a YYYY-MM-DD date. */
export function epochDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

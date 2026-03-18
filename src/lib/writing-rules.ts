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
    throw new Error('clientNowIso must be a valid ISO timestamp.')
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

export function assertTodayLocalConsistent(input: {
  todayLocal: string
  timezone: string
  clientNowIso: string
}) {
  assertIsoDate(input.todayLocal, 'todayLocal')
  const derived = localDateForInstant(input.clientNowIso, input.timezone)
  if (derived !== input.todayLocal) {
    throw new Error(
      `todayLocal (${input.todayLocal}) does not match clientNowIso (${input.clientNowIso}) in timezone (${input.timezone}). Expected ${derived}.`,
    )
  }
}

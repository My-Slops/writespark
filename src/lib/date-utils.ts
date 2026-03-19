export function toIsoLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayLocalDate() {
  return toIsoLocalDate(new Date())
}

export function shiftDate(localDate: string, deltaDays: number) {
  const d = new Date(`${localDate}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return toIsoLocalDate(d)
}

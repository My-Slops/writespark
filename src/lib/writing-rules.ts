export function countWords(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length
}

export function isDateLocked(localDate: string, todayLocal: string) {
  return localDate !== todayLocal
}

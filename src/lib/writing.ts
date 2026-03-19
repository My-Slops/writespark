import { and, asc, eq, gte, gt, or } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { computeStreaks, determineNewBadges } from './badge-engine'
import { assertIsoDate, assertTodayLocalConsistent, countWords, isDateLocked } from './writing-rules'
import { db } from './db'
import { badges, entries, identities, identityBadges, prompts, sessions, users } from './schema'
import { ensureIdentity } from './identity'
import { CONFIG } from './config'

async function resolveIdentity(deviceId: string, sessionToken?: string): Promise<typeof identities.$inferSelect> {
  const guestIdentity = await ensureIdentity(deviceId)

  if (!sessionToken) return guestIdentity

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.token, sessionToken), gt(sessions.expiresAt, new Date())),
  })
  if (!session) return guestIdentity

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
  if (!user?.identityId) return guestIdentity

  return (await db.query.identities.findFirst({ where: eq(identities.id, user.identityId) })) ?? guestIdentity
}

const baseInput = {
  sessionToken: z.string().min(CONFIG.SESSION_TOKEN_MIN_LENGTH).optional(),
  deviceId: z.string().min(CONFIG.DEVICE_ID_MIN_LENGTH),
}

/**
 * Retrieve prompt and entry data for a specific date.
 * 
 * @param localDate - Date in YYYY-MM-DD format
 * @param todayLocal - Current local date in YYYY-MM-DD format
 * @param timezone - IANA timezone identifier
 * @param clientNowIso - Current time in ISO format
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns Prompt, entry, and lock status for the requested date
 */
export const getDayData = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      localDate: z.string(),
      todayLocal: z.string(),
      timezone: z.string().min(1),
      clientNowIso: z.string().min(10),
      ...baseInput,
    }),
  )
  .handler(async ({ data }) => {
    assertIsoDate(data.localDate, 'localDate')
    assertTodayLocalConsistent({ todayLocal: data.todayLocal, timezone: data.timezone, clientNowIso: data.clientNowIso })

    const identity = await resolveIdentity(data.deviceId, data.sessionToken)

    const prompt = await db.query.prompts.findFirst({ where: eq(prompts.promptDate, data.localDate) })
    const entry = await db.query.entries.findFirst({
      where: and(eq(entries.identityId, identity.id), eq(entries.promptDate, data.localDate)),
    })

    const isLocked = data.localDate !== data.todayLocal

    return {
      prompt,
      entry,
      isLocked,
      isToday: data.localDate === data.todayLocal,
    }
  })

async function awardBadges(identityId: string, latestWordCount: number): Promise<{
  totalEntries: number
  totalWords: number
  currentStreak: number
  longestStreak: number
  newBadges: string[]
}> {
  const awarded = new Set<string>()
  const current = await db
    .select({ key: badges.key })
    .from(identityBadges)
    .innerJoin(badges, eq(identityBadges.badgeId, badges.id))
    .where(eq(identityBadges.identityId, identityId))

  current.forEach((b) => awarded.add(b.key))

  const allEntries = await db.query.entries.findMany({
    where: eq(entries.identityId, identityId),
    orderBy: asc(entries.promptDate),
  })

  const normalizedEntries = allEntries.map((e) => ({ promptDate: e.promptDate, wordCount: e.wordCount }))
  const toAward = determineNewBadges({
    entries: normalizedEntries,
    latestWordCount,
    alreadyAwarded: awarded,
  })

  if (toAward.length > 0) {
    const badgeRows = await db.select().from(badges).where(or(...toAward.map((key) => eq(badges.key, key))))
    if (badgeRows.length > 0) {
      await db.insert(identityBadges).values(
        badgeRows.map((row) => ({
          identityId,
          badgeId: row.id,
        })),
      )
    }
  }

  const totalEntries = normalizedEntries.length
  const totalWords = normalizedEntries.reduce((acc, item) => acc + item.wordCount, 0)
  const { currentStreak, longestStreak } = computeStreaks(normalizedEntries)

  return { totalEntries, totalWords, currentStreak, longestStreak, newBadges: toAward }
}

/**
 * Core logic for saving a writing entry.
 * Can be called directly from scripts or via the saveEntry server function.
 * 
 * @param data - Entry data including date, content, timezone, and identity info
 * @returns Saved entry and progress statistics (badges, streaks, word counts)
 * @throws Error if date is locked, word count exceeds limit, or validation fails
 */
async function saveEntryCore(data: {
  localDate: string
  todayLocal: string
  timezone: string
  clientNowIso: string
  content: string
  deviceId: string
  sessionToken?: string
}) {
  assertIsoDate(data.localDate, 'localDate')
  assertTodayLocalConsistent({ todayLocal: data.todayLocal, timezone: data.timezone, clientNowIso: data.clientNowIso })

  if (isDateLocked(data.localDate, data.todayLocal)) {
    throw new Error('You can only write for the current local day. Past days are locked.')
  }

  const wordCount = countWords(data.content)
  if (wordCount > CONFIG.WORD_LIMIT_PER_ENTRY) {
    throw new Error(`Entry exceeds ${CONFIG.WORD_LIMIT_PER_ENTRY}-word limit.`)
  }

  const identity = await resolveIdentity(data.deviceId, data.sessionToken)

  const existing = await db.query.entries.findFirst({
    where: and(eq(entries.identityId, identity.id), eq(entries.promptDate, data.localDate)),
  })

  let result
  if (existing) {
    ;[result] = await db
      .update(entries)
      .set({ content: data.content, wordCount, timezone: data.timezone, updatedAt: new Date() })
      .where(eq(entries.id, existing.id))
      .returning()
  } else {
    ;[result] = await db
      .insert(entries)
      .values({
        identityId: identity.id,
        promptDate: data.localDate,
        content: data.content,
        wordCount,
        timezone: data.timezone,
        locked: false,
      })
      .returning()
  }

  const progress = await awardBadges(identity.id, wordCount)
  return { entry: result, progress }
}

/**
 * Save or update a writing entry for the current day.
 * 
 * @param localDate - Date in YYYY-MM-DD format (must be today)
 * @param todayLocal - Current local date in YYYY-MM-DD format
 * @param timezone - IANA timezone identifier
 * @param clientNowIso - Current time in ISO format
 * @param content - Entry content (max 3000 words)
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns Saved entry and progress statistics
 * @throws Error if date is locked or word count exceeds limit
 */
export const saveEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      localDate: z.string(),
      todayLocal: z.string(),
      timezone: z.string().min(1),
      clientNowIso: z.string().min(10),
      content: z.string().max(CONFIG.WORD_LIMIT_PER_ENTRY * 10),
      ...baseInput,
    }),
  )
  .handler(async ({ data }) => {
    return saveEntryCore(data)
  })

/**
 * Retrieve dashboard statistics and writing history.
 * 
 * @param fromDate - Start date for filtering entries (YYYY-MM-DD)
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns Total words, days written, streaks, daily breakdown, and badges
 */
export const getDashboard = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      fromDate: z.string(),
      ...baseInput,
    }),
  )
  .handler(async ({ data }) => {
    const identity = await resolveIdentity(data.deviceId, data.sessionToken)

    const allEntries = await db.query.entries.findMany({
      where: and(eq(entries.identityId, identity.id), gte(entries.promptDate, data.fromDate)),
      orderBy: asc(entries.promptDate),
    })

    const totalWords = allEntries.reduce((acc, entry) => acc + entry.wordCount, 0)
    const badgesWon = await db
      .select({ key: badges.key, name: badges.name, description: badges.description, awardedAt: identityBadges.awardedAt })
      .from(identityBadges)
      .innerJoin(badges, eq(identityBadges.badgeId, badges.id))
      .where(eq(identityBadges.identityId, identity.id))
      .orderBy(asc(identityBadges.awardedAt))

    const normalizedEntries = allEntries.map((entry) => ({ promptDate: entry.promptDate, wordCount: entry.wordCount }))
    const { currentStreak, longestStreak } = computeStreaks(normalizedEntries)

    return {
      totalWords,
      totalDaysWritten: allEntries.length,
      currentStreak,
      longestStreak,
      byDay: allEntries.map((entry) => ({
        date: entry.promptDate,
        wordCount: entry.wordCount,
      })),
      badges: badgesWon,
    }
  })


/**
 * Export all entries as formatted Markdown.
 * 
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns Markdown-formatted export of all entries
 */
export const exportEntriesMarkdown = createServerFn({ method: 'GET' })
  .inputValidator(z.object(baseInput))
  .handler(async ({ data }) => {
    const identity = await resolveIdentity(data.deviceId, data.sessionToken)
    const allEntries = await db.query.entries.findMany({
      where: eq(entries.identityId, identity.id),
      orderBy: asc(entries.promptDate),
    })

    const lines: string[] = []
    lines.push('# WriteSpark Export')
    lines.push('')
    lines.push(`- exportedAt: ${new Date().toISOString()}`)
    lines.push(`- identityId: ${identity.id}`)
    lines.push(`- entries: ${allEntries.length}`)
    lines.push('')

    for (const entry of allEntries) {
      lines.push(`## ${entry.promptDate}`)
      lines.push('')
      lines.push(`- wordCount: ${entry.wordCount}`)
      lines.push(`- timezone: ${entry.timezone}`)
      lines.push('')
      lines.push(entry.content)
      lines.push('')
      lines.push('---')
      lines.push('')
    }

    return { markdown: lines.join('\n') }
  })

/**
 * Export all entries as JSON.
 * 
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns JSON export with metadata and all entries
 */
export const exportEntries = createServerFn({ method: 'GET' })
  .inputValidator(z.object(baseInput))
  .handler(async ({ data }) => {
    const identity = await resolveIdentity(data.deviceId, data.sessionToken)
    const allEntries = await db.query.entries.findMany({
      where: eq(entries.identityId, identity.id),
      orderBy: asc(entries.promptDate),
    })

    return {
      exportedAt: new Date().toISOString(),
      identityId: identity.id,
      entries: allEntries,
    }
  })

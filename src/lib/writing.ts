import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { computeStreaks, determineNewBadges } from './badge-engine'
import { countWords, epochDay, serverTodayFor } from './writing-rules'
import { db } from './db'
import { badges, entries, identityBadges, prompts } from './schema'
import { resolveIdentity } from './identity'
import { CONFIG } from './config'
import { deviceIdSchema, isoDateSchema, sessionTokenSchema, timezoneSchema } from './validation'

const baseInput = {
  sessionToken: sessionTokenSchema.optional(),
  deviceId: deviceIdSchema,
}

/**
 * Find the prompt for a date. Uses the exact-date prompt when present;
 * otherwise rotates deterministically over all prompts (by epoch day) so
 * calendar gaps never leave a day without a prompt. Returns null only when
 * there are no prompts at all.
 */
async function promptForDate(localDate: string): Promise<{ title: string; body: string } | null> {
  const exact = await db
    .select({ title: prompts.title, body: prompts.body })
    .from(prompts)
    .where(eq(prompts.promptDate, localDate))
    .limit(1)
  if (exact[0]) return exact[0]

  const [{ n }] = await db.select({ n: count() }).from(prompts)
  if (n === 0) return null

  const idx = ((epochDay(localDate) % n) + n) % n
  const fallback = await db
    .select({ title: prompts.title, body: prompts.body })
    .from(prompts)
    .orderBy(asc(prompts.promptDate))
    .offset(idx)
    .limit(1)
  return fallback[0] ?? null
}

/**
 * Retrieve prompt and entry data for a specific date.
 *
 * The lock state is derived from the server clock: only the date that is
 * "today" in `timezone` (server-computed) is writable.
 *
 * @param localDate - Date in YYYY-MM-DD format
 * @param timezone - IANA timezone identifier
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns Prompt (exact or rotated fallback, or null), entry (or null), lock status, and server-derived today
 */
export const getDayData = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      localDate: isoDateSchema,
      timezone: timezoneSchema,
      ...baseInput,
    }),
  )
  .handler(async ({ data }) => {
    const identity = await resolveIdentity(data.deviceId, data.sessionToken)
    const today = serverTodayFor(data.timezone)

    const prompt = await promptForDate(data.localDate)
    const entry =
      (await db.query.entries.findFirst({
        where: and(eq(entries.identityId, identity.id), eq(entries.promptDate, data.localDate)),
      })) ?? null

    return {
      prompt,
      entry,
      isLocked: data.localDate !== today,
      isToday: data.localDate === today,
      today,
    }
  })

async function awardBadges(
  identityId: string,
  latestWordCount: number,
  today: string,
): Promise<{
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

  const normalizedEntries = allEntries
    .filter((e) => e.wordCount > 0)
    .map((e) => ({ promptDate: e.promptDate, wordCount: e.wordCount }))
  const toAward = determineNewBadges({
    entries: normalizedEntries,
    latestWordCount,
    alreadyAwarded: awarded,
    today,
  })

  if (toAward.length > 0) {
    const badgeRows = await db.select().from(badges).where(inArray(badges.key, toAward))
    if (badgeRows.length > 0) {
      await db
        .insert(identityBadges)
        .values(badgeRows.map((row) => ({ identityId, badgeId: row.id })))
        .onConflictDoNothing()
    }
  }

  const totalEntries = normalizedEntries.length
  const totalWords = normalizedEntries.reduce((acc, item) => acc + item.wordCount, 0)
  const { currentStreak, longestStreak } = computeStreaks(normalizedEntries, today)

  return { totalEntries, totalWords, currentStreak, longestStreak, newBadges: toAward }
}

/**
 * Core logic for saving a writing entry.
 * Can be called directly from scripts or via the saveEntry server function.
 *
 * Blank content removes any existing entry for the day and creates none.
 *
 * @param data - Entry data including date, content, timezone, and identity info
 * @returns Saved entry (null when content is blank) and progress statistics
 * @throws Error if date is locked or word count exceeds limit
 */
async function saveEntryCore(data: {
  localDate: string
  timezone: string
  content: string
  deviceId: string
  sessionToken?: string
}) {
  // Lock is derived from the server clock; `entries.locked` is never read.
  const today = serverTodayFor(data.timezone)
  if (data.localDate !== today) {
    throw new Error('You can only write for the current local day. Past days are locked.')
  }

  const wordCount = countWords(data.content)
  if (wordCount > CONFIG.WORD_LIMIT_PER_ENTRY) {
    throw new Error(`Entry exceeds ${CONFIG.WORD_LIMIT_PER_ENTRY}-word limit.`)
  }

  const identity = await resolveIdentity(data.deviceId, data.sessionToken)

  if (wordCount === 0) {
    await db.delete(entries).where(and(eq(entries.identityId, identity.id), eq(entries.promptDate, data.localDate)))
    const progress = await awardBadges(identity.id, 0, today)
    return { entry: null, progress }
  }

  const [result] = await db
    .insert(entries)
    .values({
      identityId: identity.id,
      promptDate: data.localDate,
      content: data.content,
      wordCount,
      timezone: data.timezone,
      locked: false,
    })
    .onConflictDoUpdate({
      target: [entries.identityId, entries.promptDate],
      set: { content: data.content, wordCount, timezone: data.timezone, updatedAt: new Date() },
    })
    .returning()

  const progress = await awardBadges(identity.id, wordCount, today)
  return { entry: result, progress }
}

/**
 * Save or update a writing entry for the current day.
 *
 * "Current day" is computed on the server from `timezone`; the client cannot
 * supply its own notion of today. Blank content deletes the day's entry.
 *
 * @param localDate - Date in YYYY-MM-DD format (must be today in `timezone`)
 * @param timezone - IANA timezone identifier
 * @param content - Entry content (max 3000 words)
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns Saved entry (null if blank) and progress statistics
 * @throws Error if date is locked or word count exceeds limit
 */
export const saveEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      localDate: isoDateSchema,
      timezone: timezoneSchema,
      content: z.string().max(CONFIG.WORD_LIMIT_PER_ENTRY * 10),
      ...baseInput,
    }),
  )
  .handler(async ({ data }) => {
    return saveEntryCore(data)
  })

/**
 * Retrieve dashboard statistics and writing history (0-word entries ignored).
 *
 * @param timezone - IANA timezone identifier (used to determine today for streaks)
 * @param deviceId - Device identifier
 * @param sessionToken - Optional session token
 * @returns Total words, days written, streaks, daily breakdown, and badges
 */
export const getDashboard = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      timezone: timezoneSchema,
      ...baseInput,
    }),
  )
  .handler(async ({ data }) => {
    const identity = await resolveIdentity(data.deviceId, data.sessionToken)

    const rows = await db.query.entries.findMany({
      where: eq(entries.identityId, identity.id),
      orderBy: asc(entries.promptDate),
    })
    const written = rows.filter((entry) => entry.wordCount > 0)

    const totalWords = written.reduce((acc, entry) => acc + entry.wordCount, 0)
    const badgesWon = await db
      .select({ key: badges.key, name: badges.name, description: badges.description, awardedAt: identityBadges.awardedAt })
      .from(identityBadges)
      .innerJoin(badges, eq(identityBadges.badgeId, badges.id))
      .where(eq(identityBadges.identityId, identity.id))
      .orderBy(asc(identityBadges.awardedAt))

    const normalizedEntries = written.map((entry) => ({ promptDate: entry.promptDate, wordCount: entry.wordCount }))
    const { currentStreak, longestStreak } = computeStreaks(normalizedEntries, serverTodayFor(data.timezone))

    return {
      totalWords,
      totalDaysWritten: written.length,
      currentStreak,
      longestStreak,
      byDay: written.map((entry) => ({
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

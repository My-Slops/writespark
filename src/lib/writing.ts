import { and, asc, eq, gte, gt, sql } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { computeStreaks, determineNewBadges } from './badge-engine'
import { assertIsoDate, assertTodayLocalConsistent, countWords, isDateLocked } from './writing-rules'
import { db } from './db'
import { badges, entries, identities, identityBadges, prompts, sessions, users } from './schema'

async function ensureIdentity(deviceId: string) {
  const existing = await db.query.identities.findFirst({ where: eq(identities.deviceId, deviceId) })
  if (existing) return existing
  const [created] = await db.insert(identities).values({ deviceId }).returning()
  return created
}

async function resolveIdentity(deviceId: string, sessionToken?: string) {
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
  sessionToken: z.string().min(10).optional(),
  deviceId: z.string().min(12),
}

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

async function awardBadges(identityId: string, latestWordCount: number) {
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
    const badgeRows = await db.select().from(badges).where(sql`${badges.key} = ANY(${toAward})`)
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

export const saveEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      localDate: z.string(),
      todayLocal: z.string(),
      timezone: z.string().min(1),
      clientNowIso: z.string().min(10),
      content: z.string().max(30000),
      ...baseInput,
    }),
  )
  .handler(async ({ data }) => {
    assertIsoDate(data.localDate, 'localDate')
    assertTodayLocalConsistent({ todayLocal: data.todayLocal, timezone: data.timezone, clientNowIso: data.clientNowIso })

    if (isDateLocked(data.localDate, data.todayLocal)) {
      throw new Error('You can only write for the current local day. Past days are locked.')
    }

    const wordCount = countWords(data.content)
    if (wordCount > 3000) {
      throw new Error('Entry exceeds 3000-word limit.')
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
  })

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

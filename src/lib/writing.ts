import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { countWords, isDateLocked } from './writing-rules'
import { db } from './db'
import { badges, entries, identities, identityBadges, prompts } from './schema'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/


const ensureIdentity = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ deviceId: z.string().min(12) }))
  .handler(async ({ data }) => {
    const existing = await db.query.identities.findFirst({ where: eq(identities.deviceId, data.deviceId) })
    if (existing) return existing
    const [created] = await db.insert(identities).values({ deviceId: data.deviceId }).returning()
    return created
  })

export const getDayData = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      localDate: z.string().regex(dateRegex),
      todayLocal: z.string().regex(dateRegex),
      deviceId: z.string().min(12),
    }),
  )
  .handler(async ({ data }) => {
    const identity = await ensureIdentity({ data: { deviceId: data.deviceId } })

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

const awardableBadgeKeys = ['first_entry', 'streak_7', 'streak_10', 'single_1000', 'single_2000'] as const

type BadgeKey = (typeof awardableBadgeKeys)[number]

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

  const totalEntries = allEntries.length
  const totalWords = allEntries.reduce((acc, item) => acc + item.wordCount, 0)

  let streak = 0
  for (let i = allEntries.length - 1; i >= 0; i--) {
    if (i === allEntries.length - 1) {
      streak = 1
      continue
    }
    const currentDate = new Date(allEntries[i + 1].promptDate)
    const prevDate = new Date(allEntries[i].promptDate)
    const diffDays = (currentDate.getTime() - prevDate.getTime()) / 86400000
    if (diffDays === 1) streak += 1
    else break
  }

  const toAward: BadgeKey[] = []
  if (totalEntries >= 1 && !awarded.has('first_entry')) toAward.push('first_entry')
  if (streak >= 7 && !awarded.has('streak_7')) toAward.push('streak_7')
  if (streak >= 10 && !awarded.has('streak_10')) toAward.push('streak_10')
  if (latestWordCount >= 1000 && !awarded.has('single_1000')) toAward.push('single_1000')
  if (latestWordCount >= 2000 && !awarded.has('single_2000')) toAward.push('single_2000')

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

  return { totalEntries, totalWords, streak, newBadges: toAward }
}

export const saveEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      localDate: z.string().regex(dateRegex),
      todayLocal: z.string().regex(dateRegex),
      timezone: z.string().min(1),
      content: z.string().max(30000),
      deviceId: z.string().min(12),
    }),
  )
  .handler(async ({ data }) => {
    if (isDateLocked(data.localDate, data.todayLocal)) {
      throw new Error('You can only write for the current local day. Past days are locked.')
    }

    const wordCount = countWords(data.content)
    if (wordCount > 3000) {
      throw new Error('Entry exceeds 3000-word limit.')
    }

    const identity = await ensureIdentity({ data: { deviceId: data.deviceId } })

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
      deviceId: z.string().min(12),
      fromDate: z.string().regex(dateRegex),
    }),
  )
  .handler(async ({ data }) => {
    const identity = await ensureIdentity({ data: { deviceId: data.deviceId } })

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

    return {
      totalWords,
      totalDaysWritten: allEntries.length,
      byDay: allEntries.map((entry) => ({
        date: entry.promptDate,
        wordCount: entry.wordCount,
      })),
      badges: badgesWon,
    }
  })

export const exportEntries = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ deviceId: z.string().min(12) }))
  .handler(async ({ data }) => {
    const identity = await ensureIdentity({ data: { deviceId: data.deviceId } })
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

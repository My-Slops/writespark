import { boolean, date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const identities = pgTable('identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  deviceId: text('device_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  identityId: uuid('identity_id').references(() => identities.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const prompts = pgTable('prompts', {
  id: uuid('id').defaultRandom().primaryKey(),
  promptDate: date('prompt_date').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identityId: uuid('identity_id').notNull().references(() => identities.id),
    promptDate: date('prompt_date').notNull(),
    content: text('content').notNull(),
    wordCount: integer('word_count').notNull(),
    locked: boolean('locked').notNull().default(false),
    timezone: text('timezone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    identityDateUnique: uniqueIndex('entries_identity_date_unique').on(table.identityId, table.promptDate),
  }),
)

export const badges = pgTable('badges', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
})

export const identityBadges = pgTable(
  'identity_badges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identityId: uuid('identity_id').notNull().references(() => identities.id),
    badgeId: uuid('badge_id').notNull().references(() => badges.id),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniq: uniqueIndex('identity_badges_unique').on(table.identityId, table.badgeId),
  }),
)

export type Entry = typeof entries.$inferSelect

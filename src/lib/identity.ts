import { and, eq, gt, isNull } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import { db } from './db'
import { PublicError, SESSION_EXPIRED_MESSAGE } from './errors'
import { identities, sessions, users } from './schema'
import type * as schema from './schema'

export type Identity = typeof identities.$inferSelect

/** `db` or a transaction handle. */
export type DbExecutor = PgDatabase<PostgresJsQueryResultHKT, typeof schema>

/** Device id of the identity owned by an account (never addressable as a guest device id). */
export const accountDeviceId = (userId: string) => `account_${userId}`

export async function ensureIdentity(deviceId: string): Promise<Identity> {
  await db.insert(identities).values({ deviceId }).onConflictDoNothing({ target: identities.deviceId })
  const [row] = await db.select().from(identities).where(eq(identities.deviceId, deviceId)).limit(1)
  return row
}

/**
 * Give a legacy account (`users.identity_id` null) its own `account_<userId>`
 * identity and link it. Safe under concurrency: the identity insert is
 * idempotent and the link only fills a null `identity_id`.
 */
export async function ensureAccountIdentity(executor: DbExecutor, userId: string): Promise<Identity> {
  const deviceId = accountDeviceId(userId)
  await executor.insert(identities).values({ deviceId }).onConflictDoNothing({ target: identities.deviceId })
  const [identity] = await executor.select().from(identities).where(eq(identities.deviceId, deviceId)).limit(1)
  await executor
    .update(users)
    .set({ identityId: identity.id })
    .where(and(eq(users.id, userId), isNull(users.identityId)))
  return identity
}

/**
 * Resolve which identity a request acts as.
 *
 * - No session token: the device's guest identity.
 * - Valid session: the account's identity (created and linked for legacy accounts).
 * - Unknown/expired token, or its user is gone: throws the session-expired
 *   `PublicError`. It never falls back to the guest identity, so a signed-out
 *   user's writing can't land in a guest identity someone else on the device
 *   could later adopt.
 */
export async function resolveIdentity(deviceId: string, sessionToken?: string): Promise<Identity> {
  if (!sessionToken) return ensureIdentity(deviceId)

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.token, sessionToken), gt(sessions.expiresAt, new Date())),
  })
  if (!session) throw new PublicError(SESSION_EXPIRED_MESSAGE)
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
  if (!user) throw new PublicError(SESSION_EXPIRED_MESSAGE)

  if (user.identityId) {
    const account = await db.query.identities.findFirst({ where: eq(identities.id, user.identityId) })
    if (account) return account
  }
  return db.transaction((tx) => ensureAccountIdentity(tx, user.id))
}

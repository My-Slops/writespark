import { and, eq, gt } from 'drizzle-orm'
import { db } from './db'
import { identities, sessions, users } from './schema'

export type Identity = typeof identities.$inferSelect

export async function ensureIdentity(deviceId: string): Promise<Identity> {
  await db.insert(identities).values({ deviceId }).onConflictDoNothing({ target: identities.deviceId })
  const [row] = await db.select().from(identities).where(eq(identities.deviceId, deviceId)).limit(1)
  return row
}

/**
 * Resolve which identity a request acts as: the signed-in account's identity
 * when the session is valid, otherwise the device's guest identity.
 */
export async function resolveIdentity(deviceId: string, sessionToken?: string): Promise<Identity> {
  if (sessionToken) {
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.token, sessionToken), gt(sessions.expiresAt, new Date())),
    })
    if (session) {
      const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
      if (user?.identityId) {
        const account = await db.query.identities.findFirst({ where: eq(identities.id, user.identityId) })
        if (account) return account
      }
    }
  }
  return ensureIdentity(deviceId)
}

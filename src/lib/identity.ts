import { eq } from 'drizzle-orm'
import { db } from './db'
import { identities } from './schema'

export async function ensureIdentity(deviceId: string): Promise<typeof identities.$inferSelect> {
  const existing = await db.query.identities.findFirst({ where: eq(identities.deviceId, deviceId) })
  if (existing) return existing
  const [created] = await db.insert(identities).values({ deviceId }).returning()
  return created
}

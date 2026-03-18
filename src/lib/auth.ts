import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from './db'
import { entries, identities, sessions, users } from './schema'

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${derived}`
}

function verifyPassword(password: string, passwordHash: string) {
  const [salt, stored] = passwordHash.split(':')
  const derived = scryptSync(password, salt, 64).toString('hex')
  return timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(derived, 'hex'))
}

async function ensureIdentity(deviceId: string) {
  const found = await db.query.identities.findFirst({ where: eq(identities.deviceId, deviceId) })
  if (found) return found
  const [created] = await db.insert(identities).values({ deviceId }).returning()
  return created
}

async function createSession(userId: string) {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
  await db.insert(sessions).values({ userId, token, expiresAt })
  return { token, expiresAt }
}

async function mergeIdentityEntries(fromIdentityId: string, toIdentityId: string) {
  if (fromIdentityId === toIdentityId) return

  const fromEntries = await db.query.entries.findMany({ where: eq(entries.identityId, fromIdentityId) })

  for (const row of fromEntries) {
    const existing = await db.query.entries.findFirst({
      where: and(eq(entries.identityId, toIdentityId), eq(entries.promptDate, row.promptDate)),
    })

    if (!existing) {
      await db.insert(entries).values({
        identityId: toIdentityId,
        promptDate: row.promptDate,
        content: row.content,
        wordCount: row.wordCount,
        locked: row.locked,
        timezone: row.timezone,
      })
    }
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceId: z.string().min(12),
})

export const signup = createServerFn({ method: 'POST' })
  .inputValidator(credentialsSchema)
  .handler(async ({ data }) => {
    const existing = await db.query.users.findFirst({ where: eq(users.email, data.email) })
    if (existing) throw new Error('Account already exists for this email.')

    const identity = await ensureIdentity(data.deviceId)
    const [created] = await db
      .insert(users)
      .values({ email: data.email.toLowerCase(), passwordHash: hashPassword(data.password), identityId: identity.id })
      .returning()

    const session = await createSession(created.id)
    return {
      user: { id: created.id, email: created.email },
      session,
    }
  })

export const login = createServerFn({ method: 'POST' })
  .inputValidator(credentialsSchema)
  .handler(async ({ data }) => {
    const user = await db.query.users.findFirst({ where: eq(users.email, data.email.toLowerCase()) })
    if (!user) throw new Error('Invalid email or password.')
    if (!verifyPassword(data.password, user.passwordHash)) throw new Error('Invalid email or password.')

    const currentIdentity = await ensureIdentity(data.deviceId)
    if (!user.identityId) {
      await db.update(users).set({ identityId: currentIdentity.id }).where(eq(users.id, user.id))
    } else if (user.identityId !== currentIdentity.id) {
      await mergeIdentityEntries(currentIdentity.id, user.identityId)
    }

    const session = await createSession(user.id)

    return {
      user: { id: user.id, email: user.email },
      session,
    }
  })

export const logout = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionToken: z.string().min(10) }))
  .handler(async ({ data }) => {
    await db.delete(sessions).where(eq(sessions.token, data.sessionToken))
    return { ok: true }
  })

export const getSessionUser = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionToken: z.string().min(10).optional() }))
  .handler(async ({ data }) => {
    if (!data.sessionToken) return { user: null }
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.token, data.sessionToken), gt(sessions.expiresAt, new Date())),
    })
    if (!session) return { user: null }
    const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    if (!user) return { user: null }
    return { user: { id: user.id, email: user.email, identityId: user.identityId } }
  })

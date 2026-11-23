import { randomBytes } from 'node:crypto'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from './db'
import { entries, identities, sessions, users } from './schema'
import { ensureIdentity } from './identity'
import { CONFIG } from './config'
import { hashPassword, verifyPassword } from './password'
import { createRateLimiter } from './rate-limit'
import { deviceIdSchema, sessionTokenSchema } from './validation'

// NOTE: rate-limit state is per-process memory (resets on restart, not shared across instances).
const loginFailureLimiter = createRateLimiter({
  max: CONFIG.LOGIN_MAX_FAILURES_PER_EMAIL,
  windowMs: CONFIG.LOGIN_FAILURE_WINDOW_MS,
})
const ipLimiter = createRateLimiter({
  max: CONFIG.AUTH_MAX_ATTEMPTS_PER_IP,
  windowMs: CONFIG.AUTH_IP_WINDOW_MS,
})

const TOO_MANY = 'Too many attempts. Try again later.'

function clientIpKey(): string | undefined {
  try {
    // X-Forwarded-For is only honored when TRUST_PROXY=true (i.e. behind a reverse proxy that
    // overwrites it). Otherwise any client could spoof it to dodge the limit or lock out another IP.
    return getRequestIP({ xForwardedFor: process.env.TRUST_PROXY === 'true' }) || undefined
  } catch {
    return undefined
  }
}

/** Count an auth attempt against the caller's IP; throws when over the limit. */
function enforceIpLimit(): void {
  const ip = clientIpKey()
  if (!ip) return
  if (ipLimiter.isLimited(ip)) throw new Error(TOO_MANY)
  ipLimiter.record(ip)
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let i = 0; i < 3 && current && typeof current === 'object'; i++) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * CONFIG.SESSION_EXPIRY_DAYS)
  await db.insert(sessions).values({ userId, token, expiresAt })
  return { token, expiresAt }
}

async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}

const accountDeviceId = (userId: string) => `account_${userId}`

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(CONFIG.PASSWORD_MIN_LENGTH),
  deviceId: deviceIdSchema,
})

/**
 * Create a new user account. The device's guest identity (and its entries) is
 * adopted by the account and detached from the device, so nobody else on this
 * device can see it as a guest.
 */
export const signup = createServerFn({ method: 'POST' })
  .inputValidator(credentialsSchema)
  .handler(async ({ data }) => {
    enforceIpLimit()
    const normalizedEmail = data.email.toLowerCase()
    const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) })
    if (existing) throw new Error('Account already exists for this email.')

    const passwordHash = await hashPassword(data.password)
    const guest = await ensureIdentity(data.deviceId)

    let created: typeof users.$inferSelect
    try {
      created = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: normalizedEmail, passwordHash, identityId: guest.id })
          .returning()
        await tx
          .update(identities)
          .set({ deviceId: accountDeviceId(user.id) })
          .where(eq(identities.id, guest.id))
        return user
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error('Account already exists for this email.')
      throw error
    }

    await deleteExpiredSessions()
    const session = await createSession(created.id)
    return {
      user: { id: created.id, email: created.email },
      session,
    }
  })

/**
 * Authenticate user and create a new session. Guest entries on this device are
 * moved into the account for dates the account has no entry for.
 */
export const login = createServerFn({ method: 'POST' })
  .inputValidator(credentialsSchema)
  .handler(async ({ data }) => {
    enforceIpLimit()
    const normalizedEmail = data.email.toLowerCase()
    if (loginFailureLimiter.isLimited(normalizedEmail)) throw new Error(TOO_MANY)

    const user = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) })
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      loginFailureLimiter.record(normalizedEmail)
      throw new Error('Invalid email or password.')
    }
    loginFailureLimiter.reset(normalizedEmail)

    const guest = await ensureIdentity(data.deviceId)

    await db.transaction(async (tx) => {
      let accountIdentityId = user.identityId
      if (!accountIdentityId) {
        const [created] = await tx
          .insert(identities)
          .values({ deviceId: accountDeviceId(user.id) })
          .returning()
        await tx.update(users).set({ identityId: created.id }).where(eq(users.id, user.id))
        accountIdentityId = created.id
      } else {
        const linked = await tx.query.identities.findFirst({ where: eq(identities.id, accountIdentityId) })
        if (linked?.deviceId.startsWith('guest_')) {
          await tx
            .update(identities)
            .set({ deviceId: accountDeviceId(user.id) })
            .where(eq(identities.id, linked.id))
        }
      }

      if (guest.id !== accountIdentityId) {
        await tx
          .update(entries)
          .set({ identityId: accountIdentityId })
          .where(
            and(
              eq(entries.identityId, guest.id),
              sql`NOT EXISTS (SELECT 1 FROM entries e2 WHERE e2.identity_id = ${accountIdentityId} AND e2.prompt_date = entries.prompt_date)`,
            ),
          )
      }
    })

    await deleteExpiredSessions()
    const session = await createSession(user.id)

    return {
      user: { id: user.id, email: user.email },
      session,
    }
  })

/** Invalidate the current session. */
export const logout = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionToken: sessionTokenSchema }))
  .handler(async ({ data }) => {
    await db.delete(sessions).where(eq(sessions.token, data.sessionToken))
    return { ok: true }
  })

/** Retrieve user information for an active session. */
export const getSessionUser = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionToken: sessionTokenSchema.optional() }))
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

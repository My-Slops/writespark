import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq, gt, inArray, lt } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from './db'
import { entries, identities, sessions, users } from './schema'
import { accountDeviceId, ensureAccountIdentity, ensureIdentity } from './identity'
import { CONFIG } from './config'
import { PublicError, withPublicErrors } from './errors'
import { hashPassword, verifyPassword } from './password'
import { consumeAll, createRateLimiter } from './rate-limit'
import type { RateLimiter } from './rate-limit'
import { appendGuestContent, countWords } from './writing-rules'
import { deviceIdSchema, sessionTokenSchema } from './validation'

// NOTE: rate-limit state is per-process memory (resets on restart, not shared across instances).
//
// Login counts FAILURES only: each attempt is charged up front (synchronously, before any
// await, so parallel requests can't all slip past the check) and refunded on success.
// While any login limit is hit the password is not checked at all, so a lock can't be used
// as a password oracle. Signup counts every attempt per IP.
/** Failed logins per `email|ip`: a stranger can only lock out their own IP, not the victim's. */
const loginEmailIpLimiter = createRateLimiter({
  max: CONFIG.LOGIN_MAX_FAILURES_PER_EMAIL_IP,
  windowMs: CONFIG.LOGIN_FAILURE_WINDOW_MS,
})
/** Looser per-email backstop across all IPs, against distributed guessing. */
const loginEmailLimiter = createRateLimiter({
  max: CONFIG.LOGIN_MAX_FAILURES_PER_EMAIL,
  windowMs: CONFIG.LOGIN_FAILURE_WINDOW_MS,
})
const loginIpLimiter = createRateLimiter({
  max: CONFIG.LOGIN_MAX_FAILURES_PER_IP,
  windowMs: CONFIG.AUTH_IP_WINDOW_MS,
})
const signupIpLimiter = createRateLimiter({
  max: CONFIG.AUTH_MAX_ATTEMPTS_PER_IP,
  windowMs: CONFIG.AUTH_IP_WINDOW_MS,
})

const TOO_MANY = 'Too many attempts. Try again later.'
const INVALID_CREDENTIALS = 'Invalid email or password.'
const ACCOUNT_EXISTS = 'Account already exists for this email.'
const SIGNUP_CONFLICT = 'Could not complete sign-up. Please try again.'

let warnedUntrustedForwardedFor = false

function clientIpKey(): string | undefined {
  const trustProxy = process.env.TRUST_PROXY === 'true'
  try {
    if (!trustProxy && !warnedUntrustedForwardedFor && getRequestHeader('x-forwarded-for')) {
      warnedUntrustedForwardedFor = true
      console.warn(
        '[writespark] Request has X-Forwarded-For but TRUST_PROXY is not "true": auth rate limits are keyed on ' +
          "the direct peer's IP. Behind a reverse proxy that is the proxy's IP, so all clients share one limit. " +
          'Set TRUST_PROXY=true if a proxy you control overwrites X-Forwarded-For.',
      )
    }
    // X-Forwarded-For is only honored when TRUST_PROXY=true (i.e. behind a reverse proxy that
    // overwrites it). Otherwise any client could spoof it to dodge the limit or lock out another IP.
    return getRequestIP({ xForwardedFor: trustProxy }) || undefined
  } catch {
    return undefined
  }
}

/** The unique constraint a Postgres unique violation (23505) hit, if that's what `error` is. */
function uniqueViolationConstraint(error: unknown): string | undefined {
  let current: unknown = error
  for (let i = 0; i < 4 && current && typeof current === 'object'; i++) {
    const { code, constraint_name } = current as { code?: unknown; constraint_name?: unknown }
    if (code === '23505') return typeof constraint_name === 'string' ? constraint_name : ''
    current = (current as { cause?: unknown }).cause
  }
  return undefined
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
  .handler(
    withPublicErrors(async ({ data }) => {
      const ip = clientIpKey()
      if (ip && !signupIpLimiter.consume(ip)) throw new PublicError(TOO_MANY)

      const normalizedEmail = data.email.toLowerCase()
      const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) })
      if (existing) throw new PublicError(ACCOUNT_EXISTS)

      const passwordHash = await hashPassword(data.password)
      const guest = await ensureIdentity(data.deviceId)
      const userId = randomUUID()

      let created: typeof users.$inferSelect
      try {
        created = await db.transaction(async (tx) => {
          // Detach the guest identity first, guarded on it still belonging to this device. The
          // row lock serializes concurrent signups from one device: a loser's WHERE re-evaluates
          // against the committed rename and matches nothing.
          const detached = await tx
            .update(identities)
            .set({ deviceId: accountDeviceId(userId) })
            .where(and(eq(identities.id, guest.id), eq(identities.deviceId, data.deviceId)))
            .returning({ id: identities.id })
          if (detached.length === 0) throw new PublicError(SIGNUP_CONFLICT)

          const [user] = await tx
            .insert(users)
            .values({ id: userId, email: normalizedEmail, passwordHash, identityId: guest.id })
            .returning()
          return user
        })
      } catch (error) {
        const constraint = uniqueViolationConstraint(error)
        if (constraint !== undefined) {
          throw new PublicError(constraint.includes('email') ? ACCOUNT_EXISTS : SIGNUP_CONFLICT)
        }
        throw error
      }

      await deleteExpiredSessions()
      const session = await createSession(created.id)
      return {
        user: { id: created.id, email: created.email },
        session,
      }
    }),
  )

/**
 * Move the device's guest entries into the account. For dates the account
 * already has, the guest text is appended to the account entry (see
 * `appendGuestContent`) and the guest row is deleted. Returns the dates where
 * guest text was appended.
 */
async function mergeGuestIntoAccount(
  user: typeof users.$inferSelect,
  guestId: string,
  deviceId: string,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    // Re-check the guest under a row lock: a concurrent signup on this device may have adopted
    // it (renamed its device_id) since we looked it up. If so, it's someone's account now.
    const lockedGuest = (
      await tx
        .select({ id: identities.id })
        .from(identities)
        .where(and(eq(identities.id, guestId), eq(identities.deviceId, deviceId)))
        .for('update')
    ).at(0)

    let accountIdentityId = user.identityId
    if (!accountIdentityId) {
      accountIdentityId = (await ensureAccountIdentity(tx, user.id)).id
    } else {
      const linked = await tx.query.identities.findFirst({ where: eq(identities.id, accountIdentityId) })
      if (linked?.deviceId.startsWith('guest_')) {
        await tx
          .update(identities)
          .set({ deviceId: accountDeviceId(user.id) })
          .where(eq(identities.id, linked.id))
      }
    }

    if (!lockedGuest || lockedGuest.id === accountIdentityId) return []

    const guestEntries = await tx.select().from(entries).where(eq(entries.identityId, lockedGuest.id))
    if (guestEntries.length === 0) return []

    const accountEntries = await tx
      .select()
      .from(entries)
      .where(
        and(
          eq(entries.identityId, accountIdentityId),
          inArray(
            entries.promptDate,
            guestEntries.map((e) => e.promptDate),
          ),
        ),
      )
      .for('update')
    const accountByDate = new Map(accountEntries.map((e) => [e.promptDate, e]))

    const mergedDates: string[] = []
    for (const guestEntry of guestEntries) {
      const accountEntry = accountByDate.get(guestEntry.promptDate)
      if (!accountEntry) continue
      const content = appendGuestContent(accountEntry.content, guestEntry.content)
      if (content !== accountEntry.content) {
        await tx
          .update(entries)
          .set({ content, wordCount: countWords(content), updatedAt: new Date() })
          .where(eq(entries.id, accountEntry.id))
        mergedDates.push(guestEntry.promptDate)
      }
      await tx.delete(entries).where(eq(entries.id, guestEntry.id))
    }

    // Everything left on the guest has no counterpart in the account: move it.
    await tx.update(entries).set({ identityId: accountIdentityId }).where(eq(entries.identityId, lockedGuest.id))

    return mergedDates.sort()
  })
}

/**
 * Authenticate user and create a new session. Guest entries on this device are
 * moved into the account; where the account already has an entry for the date,
 * the guest text is appended to it (`mergedDates`).
 */
export const login = createServerFn({ method: 'POST' })
  .inputValidator(credentialsSchema)
  .handler(
    withPublicErrors(async ({ data }) => {
      const normalizedEmail = data.email.toLowerCase()
      const ip = clientIpKey()
      const emailIpKey = `${normalizedEmail}|${ip ?? 'unknown'}`
      // Charge this attempt as a failure up front, atomically across all limits.
      const charged: Array<readonly [RateLimiter, string]> = [
        [loginEmailIpLimiter, emailIpKey],
        [loginEmailLimiter, normalizedEmail],
      ]
      if (ip) charged.push([loginIpLimiter, ip])
      if (!consumeAll(charged)) throw new PublicError(TOO_MANY)

      const user = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) })
      if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
        throw new PublicError(INVALID_CREDENTIALS)
      }
      // Success: it wasn't a failure after all.
      if (ip) loginIpLimiter.refund(ip)
      loginEmailIpLimiter.reset(emailIpKey)
      loginEmailLimiter.refund(normalizedEmail)

      const guest = await ensureIdentity(data.deviceId)
      const mergedDates = await mergeGuestIntoAccount(user, guest.id, data.deviceId)

      await deleteExpiredSessions()
      const session = await createSession(user.id)

      return {
        user: { id: user.id, email: user.email },
        session,
        mergedDates,
      }
    }),
  )

/** Invalidate the current session. */
export const logout = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionToken: sessionTokenSchema }))
  .handler(
    withPublicErrors(async ({ data }) => {
      await db.delete(sessions).where(eq(sessions.token, data.sessionToken))
      return { ok: true }
    }),
  )

/** Retrieve user information for an active session (`user: null` when the token is invalid). */
export const getSessionUser = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionToken: sessionTokenSchema.optional() }))
  .handler(
    withPublicErrors(async ({ data }) => {
      if (!data.sessionToken) return { user: null }
      const session = await db.query.sessions.findFirst({
        where: and(eq(sessions.token, data.sessionToken), gt(sessions.expiresAt, new Date())),
      })
      if (!session) return { user: null }
      const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
      if (!user) return { user: null }
      return { user: { id: user.id, email: user.email, identityId: user.identityId } }
    }),
  )

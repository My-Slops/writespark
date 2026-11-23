/**
 * Errors whose message is safe to show to end users.
 *
 * Server functions are wrapped with `withPublicErrors`: a `PublicError` passes
 * through unchanged, anything else (DB/driver errors, bugs) is logged
 * server-side and replaced with a generic message, so query text and bound
 * parameters never reach the browser.
 */
export class PublicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicError'
  }
}

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/** Thrown when a request carries a session token that is unknown or expired. */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.'

export function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof Error) return error.message === SESSION_EXPIRED_MESSAGE
  return error === SESSION_EXPIRED_MESSAGE
}

export function withPublicErrors<TArgs extends Array<unknown>, TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args)
    } catch (error) {
      if (error instanceof PublicError) throw error
      console.error(error)
      throw new Error(GENERIC_ERROR_MESSAGE)
    }
  }
}

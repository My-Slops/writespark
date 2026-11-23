import { Link } from '@tanstack/react-router'
import { isSessionExpiredError } from './errors'
import { resetDeviceId, setSessionToken } from './device'

/**
 * Sign this browser out locally: drop the session token and start a fresh
 * guest device id, exactly like logout (shared-device safety). Returns the new
 * device id.
 */
export function clearLocalSession(): string {
  setSessionToken(null)
  return resetDeviceId()
}

/**
 * If `error` means the stored session is no longer valid, sign out locally and
 * return true so the caller can show `SessionExpiredBanner` instead of
 * silently carrying on as a guest. Returns false for any other error.
 */
export function handleSessionExpired(error: unknown): boolean {
  if (!isSessionExpiredError(error)) return false
  clearLocalSession()
  return true
}

export function SessionExpiredBanner({ detail, className = '' }: { detail?: string; className?: string }) {
  return (
    <div
      data-testid="session-expired"
      role="alert"
      className={`rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100 ${className}`}
    >
      <p className="font-semibold">
        Your session has expired.{' '}
        <Link to="/account" className="underline underline-offset-2">
          Log in again
        </Link>
      </p>
      {detail && <p className="text-sm mt-1 opacity-90">{detail}</p>}
    </div>
  )
}

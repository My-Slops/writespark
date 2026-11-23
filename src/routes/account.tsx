import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { getSessionUser, login, logout, signup } from '../lib/auth'
import { getOrCreateDeviceId, getSessionToken, resetDeviceId, setSessionToken as saveSessionToken } from '../lib/device'
import { SESSION_EXPIRED_MESSAGE } from '../lib/errors'
import { clearLocalSession, handleSessionExpired } from '../lib/session-client'

export const Route = createFileRoute('/account')({
  component: AccountPage,
})

function AccountPage() {
  const signupFn = useServerFn(signup)
  const loginFn = useServerFn(login)
  const logoutFn = useServerFn(logout)
  const getSessionUserFn = useServerFn(getSessionUser)

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sessionToken, setSessionTokenState] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  /** Dates where this device's guest writing was appended to the account's entry at login. */
  const [mergedDates, setMergedDates] = useState<string[]>([])

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setSessionTokenState(getSessionToken())
  }, [])

  useEffect(() => {
    if (!sessionToken) {
      setUserEmail(null)
      return
    }
    let cancelled = false
    // The stored token is no longer valid: sign out locally (fresh guest id, as on logout).
    const expire = () => {
      setDeviceId(getOrCreateDeviceId())
      setSessionTokenState(null)
      setUserEmail(null)
      setSessionExpired(true)
    }
    void getSessionUserFn({ data: { sessionToken } })
      .then((res) => {
        if (cancelled) return
        if (res.user) {
          setUserEmail(res.user.email)
          return
        }
        clearLocalSession()
        expire()
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (handleSessionExpired(err)) expire()
        else console.error('Failed to get session user', err)
      })
    return () => {
      cancelled = true
    }
  }, [getSessionUserFn, sessionToken])

  const completeAuth = (token: string, email: string) => {
    saveSessionToken(token)
    setSessionTokenState(token)
    setUserEmail(email)
    setPasswordInput('')
    setSessionExpired(false)
  }

  const handleAuth = async (mode: 'signup' | 'login') => {
    if (!deviceId) return
    if (!emailInput || !passwordInput) {
      setAuthError('Email and password are required')
      return
    }

    setAuthError(null)
    setMergedDates([])
    setIsLoading(true)

    try {
      const data = { email: emailInput, password: passwordInput, deviceId }
      if (mode === 'signup') {
        const result = await signupFn({ data })
        completeAuth(result.session.token, result.user.email)
      } else {
        const result = await loginFn({ data })
        completeAuth(result.session.token, result.user.email)
        setMergedDates(result.mergedDates)
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    if (!sessionToken) return
    setIsLoading(true)
    try {
      await logoutFn({ data: { sessionToken } })
    } catch (e) {
      console.error('Logout failed', e)
    } finally {
      // Always clear local state; become a fresh guest (shared-device safety).
      saveSessionToken(null)
      setDeviceId(resetDeviceId())
      setSessionTokenState(null)
      setUserEmail(null)
      setMergedDates([])
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <header className="mb-8 border-b border-gray-200 dark:border-zinc-800 pb-6 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Account</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your WriteSpark account and settings.</p>
      </header>

      {userEmail ? (
        <section className="rounded-2xl border bg-white dark:bg-zinc-900 p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 text-3xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">You are signed in</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 font-medium">{userEmail}</p>

          {mergedDates.length > 0 && (
            <div data-testid="merge-note" role="status" className="mb-8 rounded-lg border border-blue-100 bg-blue-50 p-4 text-left text-sm text-blue-900 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-200">
              <p>
                We added your guest writing to your existing entries for:{' '}
                {mergedDates.map((date, i) => (
                  <span key={date}>
                    {i > 0 && ', '}
                    <Link to="/" search={{ date }} className="font-semibold underline underline-offset-2">
                      {date}
                    </Link>
                  </span>
                ))}
                .
              </p>
              <p className="mt-2">
                <Link to="/" search={{ date: undefined }} className="font-semibold underline underline-offset-2">
                  Open your journal
                </Link>
              </p>
            </div>
          )}

          <button 
            disabled={isLoading}
            onClick={() => void handleLogout()}
            className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-50"
          >
            {isLoading ? 'Logging out...' : 'Log out'}
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sign in to save your progress</h2>
            <p className="text-sm text-gray-500 mt-2">WriteSpark works as a guest, but creating an account lets you access your entries across devices.</p>
          </div>
          
          {sessionExpired && !authError && (
            <div data-testid="session-expired" role="status" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
              {SESSION_EXPIRED_MESSAGE}
            </div>
          )}

          {authError && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50">
              {authError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-100 transition"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-100 transition"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button 
                disabled={isLoading || !deviceId}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 dark:focus:ring-offset-zinc-900" 
                onClick={() => void handleAuth('login')}
              >
                {isLoading ? 'Processing...' : 'Log in'}
              </button>
              <button 
                disabled={isLoading || !deviceId}
                className="flex-1 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 transition disabled:opacity-50" 
                onClick={() => void handleAuth('signup')}
              >
                Sign up
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

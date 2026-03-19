import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { getSessionUser, login, logout, signup } from '../lib/auth'
import { getOrCreateDeviceId, getSessionToken, setSessionToken as saveSessionToken } from '../lib/device'

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

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setSessionTokenState(getSessionToken())
  }, [])

  useEffect(() => {
    if (!sessionToken) {
      setUserEmail(null)
      return
    }
    void getSessionUserFn({ data: { sessionToken } })
      .then((res) => setUserEmail(res.user?.email ?? null))
      .catch((err) => console.error('Failed to get session user', err))
  }, [getSessionUserFn, sessionToken])

  const handleAuth = async (mode: 'signup' | 'login') => {
    if (!deviceId) return
    if (!emailInput || !passwordInput) {
      setAuthError('Email and password are required')
      return
    }
    
    setAuthError(null)
    setIsLoading(true)
    
    try {
      const fn = mode === 'signup' ? signupFn : loginFn
      const result = await fn({ data: { email: emailInput, password: passwordInput, deviceId } })
      saveSessionToken(result.session.token)
      setSessionTokenState(result.session.token)
      setUserEmail(result.user.email)
      setPasswordInput('')
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
      saveSessionToken(null)
      setSessionTokenState(null)
      setUserEmail(null)
    } catch (e) {
      console.error('Logout failed', e)
    } finally {
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
                disabled={isLoading}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 dark:focus:ring-offset-zinc-900" 
                onClick={() => void handleAuth('login')}
              >
                {isLoading ? 'Processing...' : 'Log in'}
              </button>
              <button 
                disabled={isLoading}
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

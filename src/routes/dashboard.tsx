import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { getDashboard } from '../lib/writing'
import { getOrCreateDeviceId, getSessionToken } from '../lib/device'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const getDashboardFn = useServerFn(getDashboard)

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  
  const [dashboard, setDashboard] = useState<null | {
    totalWords: number
    totalDaysWritten: number
    currentStreak: number
    longestStreak: number
    byDay: { date: string; wordCount: number }[]
    badges: { key: string; name: string; description: string; awardedAt: Date }[]
  }>(null)

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setSessionToken(getSessionToken())
  }, [])

  useEffect(() => {
    if (!deviceId) return

    const load = async () => {
      try {
        const dash = await getDashboardFn({
          data: { deviceId, fromDate: '2000-01-01', sessionToken: sessionToken ?? undefined },
        })
        setDashboard(dash)
      } catch (e) {
        console.error('Failed to load dashboard', e)
      }
    }

    void load()
  }, [deviceId, sessionToken, getDashboardFn])

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="mb-8 border-b border-gray-200 dark:border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Track your writing consistency and achievements over time.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-4 mb-10">
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Words</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{dashboard?.totalWords ?? 0}</p>
        </div>
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Days Written</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{dashboard?.totalDaysWritten ?? 0}</p>
        </div>
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Streak</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{dashboard?.currentStreak ?? 0} <span className="text-lg font-normal text-gray-500">days</span></p>
        </div>
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Longest Streak</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{dashboard?.longestStreak ?? 0} <span className="text-lg font-normal text-gray-500">days</span></p>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span>🏆</span> Badges
        </h2>
        
        {(!dashboard?.badges || dashboard.badges.length === 0) ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 p-10 text-center">
            <p className="text-gray-500 dark:text-gray-400">No badges yet. Write your first entry to unlock your first badge!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dashboard.badges.map((badge) => (
              <div key={badge.key} className="rounded-2xl border bg-white dark:bg-zinc-900 p-5 shadow-sm flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xl">
                  🏅
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">{badge.name}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{badge.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span>📅</span> Recent Activity
        </h2>
        
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
          <ul className="divide-y divide-gray-100 dark:divide-zinc-800 max-h-[400px] overflow-auto">
            {dashboard?.byDay && dashboard.byDay.length > 0 ? (
              [...dashboard.byDay].reverse().map((d) => (
                <li key={d.date} className="flex justify-between items-center p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{d.date}</span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-zinc-800 px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                    {d.wordCount} words
                  </span>
                </li>
              ))
            ) : (
              <li className="p-8 text-center text-gray-500 dark:text-gray-400">No entries yet.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  )
}

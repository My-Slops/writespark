import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useMemo, useState } from 'react'
import { exportEntries, getDashboard, getDayData, saveEntry } from '../lib/writing'
import { countWords } from '../lib/writing-rules'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    date: typeof search.date === 'string' ? search.date : undefined,
  }),
  component: WriteSparkPage,
})

function todayLocalDate() {
  return new Date().toLocaleDateString('en-CA')
}

function shiftDate(localDate: string, deltaDays: number) {
  const d = new Date(`${localDate}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return d.toLocaleDateString('en-CA')
}

function getOrCreateDeviceId() {
  const key = 'writespark.device_id'
  let value = window.localStorage.getItem(key)
  if (!value) {
    value = `guest_${crypto.randomUUID().replaceAll('-', '')}`
    window.localStorage.setItem(key, value)
  }
  return value
}

function WriteSparkPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const requestedDate = search.date ?? todayLocalDate()
  const today = todayLocalDate()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const getDayDataFn = useServerFn(getDayData)
  const saveEntryFn = useServerFn(saveEntry)
  const getDashboardFn = useServerFn(getDashboard)
  const exportEntriesFn = useServerFn(exportEntries)

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [promptTitle, setPromptTitle] = useState('Prompt unavailable')
  const [promptBody, setPromptBody] = useState('No prompt configured for this date yet.')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [dashboard, setDashboard] = useState<null | {
    totalWords: number
    totalDaysWritten: number
    byDay: { date: string; wordCount: number }[]
    badges: { key: string; name: string; description: string; awardedAt: Date }[]
  }>(null)

  const wordCount = useMemo(() => countWords(content), [content])

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
  }, [])

  useEffect(() => {
    if (!deviceId) return

    const load = async () => {
      const day = await getDayDataFn({ data: { localDate: requestedDate, todayLocal: today, deviceId } })
      setIsLocked(day.isLocked)
      setPromptTitle(day.prompt?.title ?? 'Prompt unavailable')
      setPromptBody(day.prompt?.body ?? 'No prompt configured for this date yet.')
      setContent(day.entry?.content ?? '')

      const dash = await getDashboardFn({ data: { deviceId, fromDate: '2000-01-01' } })
      setDashboard(dash)
    }

    void load()
  }, [deviceId, getDashboardFn, getDayDataFn, requestedDate, today])

  useEffect(() => {
    if (!deviceId || isLocked) return

    const timeout = setTimeout(async () => {
      setSaveState('saving')
      try {
        await saveEntryFn({
          data: {
            localDate: requestedDate,
            todayLocal: today,
            timezone,
            content,
            deviceId,
          },
        })
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 800)

    return () => clearTimeout(timeout)
  }, [content, deviceId, isLocked, requestedDate, saveEntryFn, timezone, today])

  const exportData = async () => {
    if (!deviceId) return
    const data = await exportEntriesFn({ data: { deviceId } })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `writespark-export-${today}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-4 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">WriteSpark</h1>
          <p className="text-sm opacity-80">Notebook-style daily writing with fixed prompts and local-day locking.</p>
        </div>
        <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => void exportData()}>
          Export JSON
        </button>
      </header>

      <section className="mb-4 flex items-center gap-2">
        <button className="rounded border px-3 py-1" onClick={() => navigate({ search: { date: shiftDate(requestedDate, -1) } })}>
          ← Prev day
        </button>
        <div className="rounded border px-3 py-1 font-medium">{requestedDate}</div>
        <button className="rounded border px-3 py-1" onClick={() => navigate({ search: { date: shiftDate(requestedDate, 1) } })}>
          Next day →
        </button>
      </section>

      <section className="mb-6 rounded-xl border bg-white/60 p-4 shadow-sm dark:bg-zinc-900/40">
        <p className="mb-1 text-xs uppercase tracking-wide opacity-70">Today&apos;s Prompt</p>
        <h2 className="mb-2 text-xl font-semibold">{promptTitle}</h2>
        <p className="leading-relaxed opacity-90">{promptBody}</p>
      </section>

      <section className="mb-8 rounded-xl border bg-[repeating-linear-gradient(to_bottom,#0000,#0000_31px,rgba(148,163,184,0.25)_32px)] p-4 md:p-6 dark:bg-[repeating-linear-gradient(to_bottom,#0000,#0000_31px,rgba(71,85,105,0.45)_32px)]">
        {isLocked && (
          <div className="mb-3 rounded-md border border-amber-400/50 bg-amber-100/60 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            This day is locked. You can view your writing but cannot edit after day-end.
          </div>
        )}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isLocked}
          className="min-h-[320px] w-full resize-y bg-transparent p-2 outline-none"
          placeholder="Start writing..."
        />
        <div className="mt-3 flex items-center justify-between text-sm opacity-80">
          <span>
            {wordCount} / 3000 words {wordCount > 3000 ? '⚠️ over limit' : ''}
          </span>
          <span>
            {isLocked ? 'Locked' : saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Idle'}
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border p-4">
          <h3 className="mb-3 text-lg font-semibold">Dashboard</h3>
          <ul className="space-y-1 text-sm">
            <li>Total words: {dashboard?.totalWords ?? 0}</li>
            <li>Days written: {dashboard?.totalDaysWritten ?? 0}</li>
            <li>Current timezone: {timezone}</li>
          </ul>
          <div className="mt-3 max-h-44 overflow-auto rounded border p-2 text-sm">
            {(dashboard?.byDay ?? []).map((d) => (
              <div key={d.date} className="flex justify-between py-1">
                <span>{d.date}</span>
                <span>{d.wordCount} words</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border p-4">
          <h3 className="mb-3 text-lg font-semibold">Badges</h3>
          <div className="space-y-2 text-sm">
            {(dashboard?.badges ?? []).length === 0 && <p>No badges yet. Write today to unlock your first one.</p>}
            {(dashboard?.badges ?? []).map((badge) => (
              <div key={badge.key} className="rounded border p-2">
                <p className="font-semibold">{badge.name}</p>
                <p className="opacity-80">{badge.description}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}

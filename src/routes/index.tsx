import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useMemo, useState } from 'react'
import { getDayData, saveEntry } from '../lib/writing'
import { countWords } from '../lib/writing-rules'
import { getOrCreateDeviceId, getSessionToken } from '../lib/device'
import { shiftDate, todayLocalDate } from '../lib/date-utils'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    date: typeof search.date === 'string' ? search.date : undefined,
  }),
  component: WriteSparkEditor,
})

function WriteSparkEditor() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const requestedDate = search.date ?? todayLocalDate()
  const today = todayLocalDate()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const getDayDataFn = useServerFn(getDayData)
  const saveEntryFn = useServerFn(saveEntry)

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sessionToken, setSessionTokenState] = useState<string | null>(null)

  const [content, setContent] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [promptTitle, setPromptTitle] = useState('Prompt unavailable')
  const [promptBody, setPromptBody] = useState('No prompt configured for this date yet.')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const wordCount = useMemo(() => countWords(content), [content])

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setSessionTokenState(getSessionToken())
  }, [])

  useEffect(() => {
    if (!deviceId) return

    const load = async () => {
      try {
        const day = await getDayDataFn({
          data: { localDate: requestedDate, todayLocal: today, timezone, clientNowIso: new Date().toISOString(), deviceId, sessionToken: sessionToken ?? undefined },
        })
        setIsLocked(day.isLocked)
        setPromptTitle(day.prompt?.title ?? 'Prompt unavailable')
        setPromptBody(day.prompt?.body ?? 'No prompt configured for this date yet.')
        setContent(day.entry?.content ?? '')
      } catch (error) {
        console.error('Failed to load day data:', error)
      }
    }

    void load()
  }, [deviceId, getDayDataFn, requestedDate, sessionToken, timezone, today])

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
            clientNowIso: new Date().toISOString(),
            sessionToken: sessionToken ?? undefined,
          },
        })
        setSaveState('saved')
        setSaveError(null)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : JSON.stringify(error) || 'Unknown save error'
        console.error('saveEntry failed', error)
        setSaveError(message)
        setSaveState('error')
      }
    }, 800)

    return () => clearTimeout(timeout)
  }, [content, deviceId, isLocked, requestedDate, saveEntryFn, sessionToken, timezone, today])

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Daily Journal</h1>
        <p className="text-gray-600 dark:text-gray-400">Write without overthinking. Lock your thoughts at the end of the day.</p>
      </header>

      <section className="mb-6 flex items-center gap-3">
        <button className="rounded-lg border bg-white dark:bg-zinc-800 px-4 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 transition" onClick={() => navigate({ search: { date: shiftDate(requestedDate, -1) } })}>
          ← Previous
        </button>
        <div className="rounded-lg border px-4 py-2 font-semibold bg-gray-50 dark:bg-zinc-800">{requestedDate}</div>
        <button className="rounded-lg border bg-white dark:bg-zinc-800 px-4 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 transition" onClick={() => navigate({ search: { date: shiftDate(requestedDate, 1) } })}>
          Next →
        </button>
      </section>

      <section className="mb-8 rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-500">Today&apos;s Prompt</p>
        <h2 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">{promptTitle}</h2>
        <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-300">{promptBody}</p>
      </section>

      <section className="mb-8 rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(to_bottom,transparent,transparent_31px,rgba(148,163,184,0.15)_32px)] dark:bg-[repeating-linear-gradient(to_bottom,transparent,transparent_31px,rgba(71,85,105,0.2)_32px)]" />
        
        {isLocked && (
          <div className="relative z-10 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            <p className="font-semibold flex items-center gap-2">
              <span>🔒</span> This day is locked.
            </p>
            <p className="text-sm mt-1 opacity-90">You can view your writing but cannot edit after the day ends.</p>
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isLocked}
          className="relative z-10 min-h-[400px] w-full resize-y bg-transparent p-2 outline-none leading-8 text-gray-800 dark:text-gray-200"
          placeholder="Start writing your thoughts here..."
        />

        <div className="relative z-10 mt-6 flex items-center justify-between border-t border-gray-100 dark:border-zinc-800 pt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
          <span className={wordCount > 3000 ? 'text-red-500' : ''}>
            {wordCount} / 3000 words {wordCount > 3000 ? '⚠️ over limit' : ''}
          </span>
          <div className="flex items-center gap-2">
            {saveState === 'error' && saveError && <span className="text-red-500">{saveError}</span>}
            <span className={`px-3 py-1 rounded-full ${isLocked ? 'bg-gray-100 dark:bg-zinc-800' : saveState === 'saving' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' : saveState === 'saved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : saveState === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-zinc-800'}`}>
              {isLocked ? 'Locked' : saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Idle'}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

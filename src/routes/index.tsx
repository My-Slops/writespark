import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getDayData, saveEntry } from '../lib/writing'
import { countWords } from '../lib/writing-rules'
import { getOrCreateDeviceId, getSessionToken } from '../lib/device'
import { shiftDate, todayLocalDate } from '../lib/date-utils'
import { CONFIG } from '../lib/config'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    date: typeof search.date === 'string' ? search.date : undefined,
  }),
  component: WriteSparkEditor,
})

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type LoadedDay = {
  date: string
  isLocked: boolean
  isToday: boolean
  today: string
  promptTitle: string
  promptBody: string
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

function WriteSparkEditor() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const requestedDate = search.date ?? todayLocalDate()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const getDayDataFn = useServerFn(getDayData)
  const saveEntryFn = useServerFn(saveEntry)

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sessionToken, setSessionTokenState] = useState<string | null>(null)

  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState<LoadedDay | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveTick, setSaveTick] = useState(0)

  const lastSavedRef = useRef('')
  const inFlightRef = useRef(false)
  const currentDateRef = useRef(requestedDate)
  currentDateRef.current = requestedDate
  const contentRef = useRef(content)
  contentRef.current = content

  const wordCount = useMemo(() => countWords(content), [content])
  const overLimit = wordCount > CONFIG.WORD_LIMIT_PER_ENTRY

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setSessionTokenState(getSessionToken())
  }, [])

  useEffect(() => {
    if (!deviceId) return

    // Drop previous day's state immediately; editor stays disabled until load completes.
    setLoaded(null)
    setLoadError(null)
    setContent('')
    setSaveState('idle')
    setSaveError(null)
    lastSavedRef.current = ''

    let cancelled = false

    const load = async () => {
      try {
        const day = await getDayDataFn({
          data: { localDate: requestedDate, timezone, deviceId, sessionToken: sessionToken ?? undefined },
        })
        if (cancelled) return
        const loadedContent = day.entry?.content ?? ''
        lastSavedRef.current = loadedContent
        setContent(loadedContent)
        setLoaded({
          date: requestedDate,
          isLocked: day.isLocked,
          isToday: day.isToday,
          today: day.today,
          promptTitle: day.prompt?.title ?? 'Prompt unavailable',
          promptBody: day.prompt?.body ?? 'No prompt configured for this date yet.',
        })
      } catch (error) {
        if (cancelled) return
        console.error('Failed to load day data:', error)
        setLoadError(errorMessage(error, 'Failed to load this day.'))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [deviceId, getDayDataFn, requestedDate, sessionToken, timezone])

  const isReady = loaded !== null && loaded.date === requestedDate
  const isLocked = isReady && loaded.isLocked

  useEffect(() => {
    if (!deviceId || !isReady || isLocked) return
    if (content === lastSavedRef.current) return

    if (overLimit) return // status is derived from overLimit below; nothing is sent

    const timeout = setTimeout(async () => {
      if (inFlightRef.current) return // re-triggered via saveTick when the in-flight save finishes
      const date = requestedDate
      const snapshot = content
      inFlightRef.current = true
      setSaveState('saving')
      try {
        await saveEntryFn({
          data: {
            localDate: date,
            timezone,
            content: snapshot,
            deviceId,
            sessionToken: sessionToken ?? undefined,
          },
        })
        if (currentDateRef.current === date) {
          lastSavedRef.current = snapshot
          setSaveState('saved')
          setSaveError(null)
        }
      } catch (error) {
        console.error('saveEntry failed', error)
        if (currentDateRef.current === date) {
          setSaveError(errorMessage(error, 'Unknown save error'))
          setSaveState('error')
        }
      } finally {
        inFlightRef.current = false
        // Only re-run when the text changed while this save was in flight; otherwise a
        // persistent error (e.g. the day rolled over) would retry every debounce forever.
        if (contentRef.current !== snapshot) setSaveTick((t) => t + 1)
      }
    }, CONFIG.AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [content, deviceId, isLocked, isReady, overLimit, requestedDate, saveEntryFn, saveTick, sessionToken, timezone])

  const status: SaveState | 'loading' | 'unavailable' | 'locked' | 'overlimit' = !isReady
    ? loadError
      ? 'unavailable'
      : 'loading'
    : isLocked
      ? 'locked'
      : overLimit
        ? 'overlimit'
        : saveState

  const STATUS_LABELS: Record<typeof status, string> = {
    loading: 'Loading…',
    unavailable: 'Unavailable',
    locked: 'Locked',
    overlimit: 'Over limit, not saved',
    idle: 'Idle',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }
  const saveLabel = STATUS_LABELS[status]

  const isFuture = isReady && loaded.isLocked && requestedDate > loaded.today
  const promptTitle = isReady ? loaded.promptTitle : 'Loading…'
  const promptBody = isReady ? loaded.promptBody : ''

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
        
        {loadError && (
          <div data-testid="load-error" role="alert" className="relative z-10 mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
            <p className="font-semibold">Could not load this day.</p>
            <p className="text-sm mt-1 opacity-90">{loadError}</p>
          </div>
        )}

        {isLocked && (
          <div data-testid="lock-banner" className="relative z-10 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            {isFuture ? (
              <>
                <p className="font-semibold flex items-center gap-2">
                  <span>🔒</span> This day hasn&apos;t started yet.
                </p>
                <p className="text-sm mt-1 opacity-90">You can write once the day begins.</p>
              </>
            ) : (
              <>
                <p className="font-semibold flex items-center gap-2">
                  <span>🔒</span> This day is locked.
                </p>
                <p className="text-sm mt-1 opacity-90">You can view your writing but cannot edit after the day ends.</p>
              </>
            )}
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          data-testid="editor"
          disabled={!isReady || isLocked}
          className="relative z-10 min-h-[400px] w-full resize-y bg-transparent p-2 outline-none leading-8 text-gray-800 dark:text-gray-200"
          placeholder="Start writing your thoughts here..."
        />

        <div className="relative z-10 mt-6 flex items-center justify-between border-t border-gray-100 dark:border-zinc-800 pt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
          <span className={overLimit ? 'text-red-500' : ''}>
            {wordCount} / {CONFIG.WORD_LIMIT_PER_ENTRY} words {overLimit ? '⚠️ over limit' : ''}
          </span>
          <div className="flex items-center gap-2">
            {status === 'error' && saveError && <span data-testid="save-error" className="text-red-500">{saveError}</span>}
            <span data-testid="save-status" data-state={status} className={`px-3 py-1 rounded-full ${status === 'saving' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' : status === 'saved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : status === 'error' || status === 'overlimit' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-zinc-800'}`}>
              {saveLabel}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

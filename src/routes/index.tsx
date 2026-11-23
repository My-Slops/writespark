import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDayData, saveEntry } from '../lib/writing'
import { countWords } from '../lib/writing-rules'
import { getOrCreateDeviceId, getSessionToken } from '../lib/device'
import { shiftDate } from '../lib/date-utils'
import { CONFIG } from '../lib/config'
import { GENERIC_ERROR_MESSAGE } from '../lib/errors'
import { SessionExpiredBanner, handleSessionExpired } from '../lib/session-client'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    date: typeof search.date === 'string' && search.date !== '' ? search.date : undefined,
  }),
  component: WriteSparkEditor,
})

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type ClientSession = { deviceId: string; sessionToken: string | undefined; timezone: string }

type LoadedDay = {
  /** The `?date` this load answered; undefined means "the server's today". */
  view: string | undefined
  /** The resolved date being shown and edited. */
  date: string
  isLocked: boolean
  today: string
  promptTitle: string
  promptBody: string
}

type Draft = { date: string; content: string }

/** Server message for a save to a day that is no longer today. */
const PAST_DAY_ERROR_PREFIX = 'You can only write for the current local day'

/**
 * Tail of the save queue, shared by every mount of the editor: saves run one at
 * a time in order, and a load waits for it so it never reads text that is
 * about to be overwritten (including a save flushed by a previous mount).
 */
let saveQueue: Promise<void> | null = null

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

function isPastDayError(error: unknown) {
  return errorMessage(error, '').startsWith(PAST_DAY_ERROR_PREFIX)
}

function isOverLimit(text: string) {
  return text.length > CONFIG.MAX_CONTENT_CHARS || countWords(text) > CONFIG.WORD_LIMIT_PER_ENTRY
}

function WriteSparkEditor() {
  const navigate = Route.useNavigate()
  const { date: view } = Route.useSearch()

  const getDayDataFn = useServerFn(getDayData)
  const saveEntryFn = useServerFn(saveEntry)

  const [session, setSession] = useState<ClientSession | null>(null)
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState<LoadedDay | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveTick, setSaveTick] = useState(0)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [dayEnded, setDayEnded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Read from async callbacks, effect cleanups and `beforeunload`, so kept in refs.
  const sessionRef = useRef<ClientSession | null>(null)
  /** Bumped whenever a load starts; a save may only update state if no newer load began. */
  const loadGenRef = useRef(0)
  /** Editor text for the loaded day while it is writable; null otherwise. */
  const draftRef = useRef<Draft | null>(null)
  /** Text the server is known to hold for the loaded day. */
  const lastSavedRef = useRef('')
  /** Text most recently sent (or queued) for the loaded day, whatever the outcome. */
  const lastSubmittedRef = useRef('')
  const expiredRef = useRef(false)
  const dayEndedRef = useRef(false)

  const wordCount = useMemo(() => countWords(content), [content])
  const overLimit = wordCount > CONFIG.WORD_LIMIT_PER_ENTRY || content.length > CONFIG.MAX_CONTENT_CHARS

  useEffect(() => {
    const value: ClientSession = {
      deviceId: getOrCreateDeviceId(),
      sessionToken: getSessionToken() ?? undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    sessionRef.current = value
    setSession(value)
  }, [])

  const markSessionExpired = useCallback(() => {
    expiredRef.current = true
    setSessionExpired(true)
  }, [])

  /** Queue a save of `snapshot` for `date` behind any save already in flight. */
  const enqueueSave = useCallback(
    (date: string, snapshot: string) => {
      const current = sessionRef.current
      if (!current || expiredRef.current || dayEndedRef.current) return

      const gen = loadGenRef.current
      const previous = saveQueue
      lastSubmittedRef.current = snapshot
      setSaveState('saving')

      let promise: Promise<void> | null = null
      const run = async () => {
        await previous
        try {
          // A previous save may have found the session expired: never fall back to guest.
          if (expiredRef.current) return
          await saveEntryFn({
            data: {
              localDate: date,
              timezone: current.timezone,
              content: snapshot,
              deviceId: current.deviceId,
              sessionToken: current.sessionToken,
            },
          })
          if (loadGenRef.current === gen) {
            lastSavedRef.current = snapshot
            setSaveState('saved')
            setSaveError(null)
          }
        } catch (error) {
          if (handleSessionExpired(error)) {
            markSessionExpired()
          } else if (loadGenRef.current === gen && isPastDayError(error)) {
            dayEndedRef.current = true
            setDayEnded(true)
            setSaveState('error')
          } else if (loadGenRef.current === gen) {
            console.error('saveEntry failed', error)
            setSaveError(errorMessage(error, GENERIC_ERROR_MESSAGE))
            setSaveState('error')
          } else {
            console.error('saveEntry failed after leaving the day', error)
          }
        } finally {
          if (saveQueue === promise) saveQueue = null
          // Re-arm the debounce only if the text changed while this save was in flight;
          // otherwise a persistent error would retry every debounce forever.
          if (loadGenRef.current === gen && draftRef.current && draftRef.current.content !== snapshot) {
            setSaveTick((t) => t + 1)
          }
        }
      }
      promise = run()
      saveQueue = promise
    },
    [markSessionExpired, saveEntryFn],
  )

  /** Save the loaded day's unsaved text now, without waiting for the debounce. */
  const flushDraft = useCallback(() => {
    const draft = draftRef.current
    if (!draft) return
    if (draft.content === lastSavedRef.current || draft.content === lastSubmittedRef.current) return
    if (isOverLimit(draft.content)) return
    enqueueSave(draft.date, draft.content)
  }, [enqueueSave])

  useEffect(() => {
    if (!session || expiredRef.current) return

    const gen = ++loadGenRef.current
    // Drop the previous view's state; the editor stays disabled until this load completes.
    draftRef.current = null
    lastSavedRef.current = ''
    lastSubmittedRef.current = ''
    dayEndedRef.current = false
    setLoaded(null)
    setLoadError(null)
    setContent('')
    setSaveState('idle')
    setSaveError(null)
    setDayEnded(false)

    let cancelled = false
    // A function (not an inline check) so the flag is re-read after each await.
    const isStale = () => cancelled || loadGenRef.current !== gen

    const load = async () => {
      // Let any in-flight or just-flushed save land first so we read the latest text.
      await saveQueue
      if (isStale()) return
      try {
        const day = await getDayDataFn({
          data: {
            ...(view ? { localDate: view } : {}),
            timezone: session.timezone,
            deviceId: session.deviceId,
            sessionToken: session.sessionToken,
          },
        })
        if (isStale()) return
        const text = day.entry?.content ?? ''
        lastSavedRef.current = text
        lastSubmittedRef.current = text
        draftRef.current = day.isLocked ? null : { date: day.date, content: text }
        setContent(text)
        setLoaded({
          view,
          date: day.date,
          isLocked: day.isLocked,
          today: day.today,
          promptTitle: day.prompt?.title ?? 'Prompt unavailable',
          promptBody: day.prompt?.body ?? 'No prompt configured for this date yet.',
        })
      } catch (error) {
        if (isStale()) return
        if (handleSessionExpired(error)) {
          markSessionExpired()
          return
        }
        console.error('Failed to load day data:', error)
        setLoadError(errorMessage(error, GENERIC_ERROR_MESSAGE))
      }
    }

    void load()

    return () => {
      cancelled = true
      // Leaving this view (date navigation or unmount): save what was typed right away.
      flushDraft()
    }
  }, [flushDraft, getDayDataFn, markSessionExpired, reloadKey, session, view])

  const isReady = loaded !== null && loaded.view === view
  const isLocked = isReady && loaded.isLocked
  const editableDate = isReady && !loaded.isLocked ? loaded.date : null

  useEffect(() => {
    if (!editableDate || sessionExpired || dayEnded || overLimit) return // over limit: nothing is sent
    if (content === lastSavedRef.current || content === lastSubmittedRef.current) return

    const timeout = setTimeout(() => {
      if (saveQueue) return // re-armed via saveTick when the in-flight save settles
      enqueueSave(editableDate, content)
    }, CONFIG.AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [content, dayEnded, editableDate, enqueueSave, overLimit, saveTick, sessionExpired])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flushDraft()
      const draft = draftRef.current
      const unsaved = saveQueue !== null || (draft !== null && draft.content !== lastSavedRef.current)
      if (!unsaved) return
      event.preventDefault()
      // Older browsers only prompt when returnValue is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushDraft])

  const handleChange = (value: string) => {
    setContent(value)
    if (draftRef.current) draftRef.current = { date: draftRef.current.date, content: value }
  }

  const goToDay = (deltaDays: number) => {
    if (!isReady) return
    void navigate({ search: { date: shiftDate(loaded.date, deltaDays) } })
  }

  const startToday = () => {
    setReloadKey((k) => k + 1)
    if (view !== undefined) void navigate({ search: { date: undefined } })
  }

  const status: SaveState | 'loading' | 'unavailable' | 'locked' | 'overlimit' | 'expired' = sessionExpired
    ? 'expired'
    : !isReady
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
    expired: 'Not saved',
    idle: 'Idle',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }
  const saveLabel = STATUS_LABELS[status]

  // With no `?date` the day is only known once the server answers, so show a
  // placeholder rather than guessing from the client clock.
  const dateLabel = isReady ? loaded.date : view
  const isFuture = isReady && loaded.isLocked && loaded.date > loaded.today
  const promptTitle = isReady ? loaded.promptTitle : 'Loading…'
  const promptBody = isReady ? loaded.promptBody : ''
  const navDisabled = !isReady || sessionExpired

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Daily Journal</h1>
        <p className="text-gray-600 dark:text-gray-400">Write without overthinking. Lock your thoughts at the end of the day.</p>
      </header>

      <section className="mb-6 flex items-center gap-3">
        <button disabled={navDisabled} className="rounded-lg border bg-white dark:bg-zinc-800 px-4 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 transition disabled:opacity-50" onClick={() => goToDay(-1)}>
          ← Previous
        </button>
        <div data-testid="current-date" className="rounded-lg border px-4 py-2 font-semibold bg-gray-50 dark:bg-zinc-800 min-w-[8.5rem] text-center tabular-nums">
          {dateLabel ?? <span aria-label="Loading date">…</span>}
        </div>
        <button disabled={navDisabled} className="rounded-lg border bg-white dark:bg-zinc-800 px-4 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 transition disabled:opacity-50" onClick={() => goToDay(1)}>
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

        {sessionExpired && (
          <SessionExpiredBanner className="relative z-10 mb-4" detail="Your writing is not being saved. Log in to keep writing to your account." />
        )}

        {loadError && !sessionExpired && (
          <div data-testid="load-error" role="alert" className="relative z-10 mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
            <p className="font-semibold">Could not load this day.</p>
            <p className="text-sm mt-1 opacity-90">{loadError}</p>
          </div>
        )}

        {dayEnded && !sessionExpired && (
          <div data-testid="day-ended" role="alert" className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            <p className="font-semibold">This day has ended. Reload to start today&apos;s entry.</p>
            <button
              type="button"
              onClick={startToday}
              className="rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-100 dark:hover:bg-amber-950 transition"
            >
              Reload
            </button>
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
          onChange={(e) => handleChange(e.target.value)}
          data-testid="editor"
          disabled={!isReady || isLocked || sessionExpired}
          readOnly={dayEnded}
          className="relative z-10 min-h-[400px] w-full resize-y bg-transparent p-2 outline-none leading-8 text-gray-800 dark:text-gray-200"
          placeholder="Start writing your thoughts here..."
        />

        <div className="relative z-10 mt-6 flex items-center justify-between border-t border-gray-100 dark:border-zinc-800 pt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
          <span className={overLimit ? 'text-red-500' : ''}>
            {wordCount} / {CONFIG.WORD_LIMIT_PER_ENTRY} words {overLimit ? '⚠️ over limit' : ''}
          </span>
          <div className="flex items-center gap-2">
            {status === 'error' && saveError && <span data-testid="save-error" className="text-red-500">{saveError}</span>}
            <span data-testid="save-status" data-state={status} className={`px-3 py-1 rounded-full ${status === 'saving' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' : status === 'saved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : status === 'error' || status === 'overlimit' || status === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-zinc-800'}`}>
              {saveLabel}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

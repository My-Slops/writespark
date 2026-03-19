import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { exportEntries, exportEntriesMarkdown } from '../lib/writing'
import { getOrCreateDeviceId, getSessionToken } from '../lib/device'
import { todayLocalDate } from '../lib/date-utils'

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})

function HistoryPage() {
  const exportEntriesFn = useServerFn(exportEntries)
  const exportEntriesMarkdownFn = useServerFn(exportEntriesMarkdown)

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
    setSessionToken(getSessionToken())
  }, [])

  const exportData = async () => {
    if (!deviceId) return
    const today = todayLocalDate()
    try {
      const data = await exportEntriesFn({ data: { deviceId, sessionToken: sessionToken ?? undefined } })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `writespark-export-${today}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export JSON', e)
    }
  }

  const exportMarkdownData = async () => {
    if (!deviceId) return
    const today = todayLocalDate()
    try {
      const data = await exportEntriesMarkdownFn({ data: { deviceId, sessionToken: sessionToken ?? undefined } })
      const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `writespark-export-${today}.md`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export Markdown', e)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <header className="mb-8 border-b border-gray-200 dark:border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">History & Data</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Export your journal entries and view past writings.</p>
      </header>

      <section className="mb-10">
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-zinc-800 dark:text-blue-400 text-3xl">
            💾
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Export Your Data</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
            Your data belongs to you. Download all your journal entries anytime in JSON or Markdown format.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => void exportData()}
              className="w-full sm:w-auto px-6 py-3 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-medium hover:bg-gray-50 dark:hover:bg-zinc-700 transition flex items-center justify-center gap-2"
            >
              <span>{'{ }'}</span> JSON Export
            </button>
            <button 
              onClick={() => void exportMarkdownData()}
              className="w-full sm:w-auto px-6 py-3 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-medium hover:bg-gray-50 dark:hover:bg-zinc-700 transition flex items-center justify-center gap-2"
            >
              <span>📄</span> Markdown Export
            </button>
          </div>
        </div>
      </section>
      
      <section>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-6 dark:border-blue-900/30 dark:bg-blue-950/20">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Viewing past entries</h3>
          <p className="text-blue-800 dark:text-blue-300 text-sm">
            To view a specific past entry, navigate to the Journal page and use the "Previous" and "Next" buttons to change the date. Past dates are locked and cannot be edited.
          </p>
        </div>
      </section>
    </div>
  )
}

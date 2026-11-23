import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

const card = 'rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm'
const heading = 'mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100'
const body = 'leading-relaxed text-gray-700 dark:text-gray-300'

function About() {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <header className="mb-8 border-b border-gray-200 dark:border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">About WriteSpark</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">A small daily journal that asks you to write, and then lets the day go.</p>
      </header>

      <div className="grid gap-6">
        <section className={card}>
          <h2 className={heading}>What it is</h2>
          <p className={body}>
            Every calendar day has one writing prompt. You can write only for today, in your own local day, and once the day ends the entry becomes read-only. Past days stay readable but cannot be edited, and future days stay closed until they begin.
          </p>
        </section>

        <section className={card}>
          <h2 className={heading}>Guest mode or an account</h2>
          <p className={body}>
            You can start writing right away as a guest. Your entries are tied to this browser. If you want to keep your journal across devices, you can optionally create an account from the Account page and log in anywhere.
          </p>
        </section>

        <section className={card}>
          <h2 className={heading}>Your data is yours</h2>
          <p className={body}>
            Export all of your entries at any time as JSON or Markdown from the History page.
          </p>
        </section>

        <section className={card}>
          <h2 className={heading}>Open source</h2>
          <p className={body}>
            WriteSpark is open source under the MIT license. The code lives at{' '}
            <a
              href="https://github.com/My-Slops/writespark"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
            >
              github.com/My-Slops/writespark
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}

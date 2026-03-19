import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 px-4 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between py-4">
        <Link to="/" search={{ date: undefined }} className="flex items-center gap-2 font-bold no-underline text-lg tracking-tight text-gray-900 dark:text-white transition-opacity hover:opacity-80">
          <span className="text-xl">✍️</span> WriteSpark
        </Link>
        <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar">
          <Link 
            to="/" 
            search={{ date: undefined }} 
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-800" 
            activeProps={{ className: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/20' }}
          >
            Journal
          </Link>
          <Link 
            to="/dashboard" 
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-800" 
            activeProps={{ className: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/20' }}
          >
            Dashboard
          </Link>
          <Link 
            to="/history" 
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-800 hidden sm:block" 
            activeProps={{ className: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/20' }}
          >
            History
          </Link>
          <Link 
            to="/account" 
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-800" 
            activeProps={{ className: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/20' }}
          >
            Account
          </Link>
          <div className="ml-1 pl-2 sm:pl-4 border-l border-gray-200 dark:border-zinc-800">
            <ThemeToggle />
          </div>
        </div>
      </nav>
    </header>
  )
}

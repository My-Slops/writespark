import { Link } from '@tanstack/react-router'

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-950/50 py-10">
      <div className="mx-auto w-full max-w-4xl px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700 dark:text-gray-300">WriteSpark</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://github.com/My-Slops/writespark" target="_blank" rel="noreferrer" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            GitHub
          </a>
          <Link to="/history" className="sm:hidden hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            History
          </Link>
          <span className="opacity-50">MIT License</span>
        </div>
      </div>
    </footer>
  )
}

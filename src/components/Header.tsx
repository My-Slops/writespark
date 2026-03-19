import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 px-4 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between py-3">
        <Link to="/" search={{ date: undefined }} className="font-semibold no-underline text-lg">
          ✍️ WriteSpark
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/" search={{ date: undefined }} className="text-sm no-underline opacity-85 hover:opacity-100 font-medium" activeProps={{ className: 'text-blue-500 opacity-100' }}>
            Journal
          </Link>
          <Link to="/dashboard" className="text-sm no-underline opacity-85 hover:opacity-100 font-medium" activeProps={{ className: 'text-blue-500 opacity-100' }}>
            Dashboard
          </Link>
          <Link to="/history" className="text-sm no-underline opacity-85 hover:opacity-100 font-medium" activeProps={{ className: 'text-blue-500 opacity-100' }}>
            History
          </Link>
          <Link to="/account" className="text-sm no-underline opacity-85 hover:opacity-100 font-medium" activeProps={{ className: 'text-blue-500 opacity-100' }}>
            Account
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}

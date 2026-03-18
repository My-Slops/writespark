/**
 * Reproduction script for testing saveEntry functionality
 * 
 * Usage: tsx scripts/repro-save.ts
 * 
 * Requires: DATABASE_URL environment variable set
 */
import { saveEntryCore } from '../src/lib/writing'

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set')
  console.error('Copy .env.example to .env and configure your database connection')
  process.exit(1)
}

async function main() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const today = `${y}-${m}-${d}`

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const out = await saveEntryCore({
    localDate: today,
    todayLocal: today,
    timezone,
    clientNowIso: now.toISOString(),
    content: 'hello repro ' + Date.now(),
    deviceId: 'guest_repro1234567890',
  })
  console.log('ok', out)
}

main().catch((e) => {
  console.error('ERR: Failed to save entry')
  console.error(e)
  process.exit(1)
})

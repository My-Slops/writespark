import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const promptsPath = path.resolve(__dirname, '../prompts/calendar-prompts.json')

const promptSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(3).max(160),
  body: z.string().min(20).max(5000),
})

const promptsSchema = z.array(promptSchema).min(1)

function toDate(date) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function dateDiffDays(a, b) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
}

const raw = await fs.readFile(promptsPath, 'utf-8')
const parsedJson = JSON.parse(raw)
const prompts = promptsSchema.parse(parsedJson)

const dates = prompts.map((p) => p.date)
const unique = new Set(dates)
if (unique.size !== dates.length) {
  throw new Error('Prompt dates must be unique. Duplicate date found.')
}

const sorted = [...dates].sort()
const missing = []
for (let i = 1; i < sorted.length; i++) {
  const diff = dateDiffDays(sorted[i - 1], sorted[i])
  if (diff > 1) {
    missing.push({ from: sorted[i - 1], to: sorted[i], gap: diff - 1 })
  }
}

console.log(`Validated ${prompts.length} prompts.`)
console.log(`Date range: ${sorted[0]} -> ${sorted[sorted.length - 1]}`)
if (missing.length > 0) {
  console.warn('Missing date coverage detected:')
  for (const gap of missing) {
    console.warn(`- gap of ${gap.gap} day(s): ${gap.from} -> ${gap.to}`)
  }
} else {
  console.log('No coverage gaps detected in current range.')
}

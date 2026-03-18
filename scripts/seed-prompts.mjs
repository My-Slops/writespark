import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { z } from 'zod'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const promptsPath = path.resolve(__dirname, '../prompts/calendar-prompts.json')

const promptSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(3).max(160),
  body: z.string().min(20).max(5000),
})

const promptsSchema = z.array(promptSchema).min(1)

const raw = await fs.readFile(promptsPath, 'utf-8')
const prompts = promptsSchema.parse(JSON.parse(raw))

const dateSet = new Set(prompts.map((p) => p.date))
if (dateSet.size !== prompts.length) {
  throw new Error('Prompt dates must be unique. Found duplicates in calendar-prompts.json.')
}

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://localhost:5432/writespark')

for (const prompt of prompts) {
  await sql`
    insert into prompts (prompt_date, title, body)
    values (${prompt.date}, ${prompt.title}, ${prompt.body})
    on conflict (prompt_date) do update set title = excluded.title, body = excluded.body
  `
}

console.log(`Seeded ${prompts.length} prompts.`)
await sql.end({ timeout: 5 })

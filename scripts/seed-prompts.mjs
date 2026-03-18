import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const promptsPath = path.resolve(__dirname, '../prompts/calendar-prompts.json')
const prompts = JSON.parse(await fs.readFile(promptsPath, 'utf-8'))

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

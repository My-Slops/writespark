import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const errors = []

if (!process.env.DATABASE_URL) {
  errors.push('DATABASE_URL is required but missing.')
}

if (!fs.existsSync('prompts/calendar-prompts.json')) {
  errors.push('prompts/calendar-prompts.json is missing.')
}

const validate = spawnSync('node', ['scripts/validate-prompts.mjs'], {
  stdio: 'inherit',
  env: process.env,
})
if (validate.status !== 0) {
  errors.push('Prompt validation failed.')
}

if (errors.length > 0) {
  console.error('\nStartup checks failed:')
  for (const err of errors) console.error(`- ${err}`)
  process.exit(1)
}

console.log('\nStartup checks passed.')

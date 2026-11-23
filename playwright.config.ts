import { defineConfig } from '@playwright/test'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/writespark'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 3100',
    env: { DATABASE_URL: databaseUrl },
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

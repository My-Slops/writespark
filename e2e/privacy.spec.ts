import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const PASSWORD = 'correct-horse-battery'
const DEVICE_KEY = 'writespark.device_id'

function uniqueRun() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

async function authenticate(page: Page, button: 'Log in' | 'Sign up', email: string) {
  await page.goto('/account')
  // Buttons are disabled until the page has hydrated; filling before that gets wiped by React.
  await expect(page.getByRole('button', { name: button, exact: true })).toBeEnabled()
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: button, exact: true }).click()
  await expect(page.getByText('You are signed in')).toBeVisible({ timeout: 10_000 })
}

async function logout(page: Page) {
  await page.goto('/account')
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 })
}

/** Open today's journal and wait until the editor is usable. */
async function openJournal(page: Page) {
  await page.goto('/')
  const editor = page.getByTestId('editor')
  await expect(editor).toBeEnabled()
  return editor
}

async function writeAndWaitForSave(page: Page, text: string) {
  const editor = await openJournal(page)
  await editor.fill(text)
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 })
}

test('entries are private per account, and a device id no longer reaches them after signup', async ({ page }) => {
  const run = uniqueRun()
  const emailA = `user-a-${run}@example.com`
  const emailB = `user-b-${run}@example.com`
  const textA = `Private text of user A ${run}`

  // D: this browser's guest device id before anyone signs up.
  await openJournal(page)
  const deviceD = await page.evaluate((key) => window.localStorage.getItem(key), DEVICE_KEY)
  if (!deviceD) throw new Error('expected a guest device id in localStorage')
  expect(deviceD).toMatch(/^guest_[0-9a-f]{32}$/)

  await authenticate(page, 'Sign up', emailA)
  await writeAndWaitForSave(page, textA)
  await logout(page)

  // Logout gives the browser a fresh id; put D back so only the server can keep A's text private.
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [DEVICE_KEY, deviceD] as const)
  let editor = await openJournal(page)
  await expect(editor).toHaveValue('')
  expect(await page.evaluate((key) => window.localStorage.getItem(key), DEVICE_KEY)).toBe(deviceD)

  // A new account created from device D must not inherit A's writing either.
  await authenticate(page, 'Sign up', emailB)
  editor = await openJournal(page)
  await expect(editor).toHaveValue('')

  await logout(page)

  await authenticate(page, 'Log in', emailA)
  editor = await openJournal(page)
  await expect(editor).toHaveValue(textA)
})

test('logging in appends guest writing to the account entry for the same day', async ({ page }) => {
  const run = uniqueRun()
  const emailA = `user-merge-${run}@example.com`
  const textA = `A-text ${run}`
  const textG = `G-text ${run}`

  await authenticate(page, 'Sign up', emailA)
  await writeAndWaitForSave(page, textA)
  await logout(page)

  // Fresh guest on the same browser writes for the same day.
  const editor = await openJournal(page)
  await expect(editor).toHaveValue('')
  const today = (await page.getByTestId('current-date').textContent())?.trim() ?? ''
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await editor.fill(textG)
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 })

  await authenticate(page, 'Log in', emailA)
  const note = page.getByTestId('merge-note')
  await expect(note).toBeVisible()
  await expect(note).toContainText('We added your guest writing to your existing entries for:')
  await expect(note).toContainText(today)

  await openJournal(page)
  await expect(editor).toHaveValue(new RegExp(textG))
  const merged = await editor.inputValue()
  const lines = merged.split('\n').map((line) => line.trim())
  const separator = lines.indexOf('---')
  expect(separator).toBeGreaterThan(-1)
  expect(lines.slice(0, separator).join('\n')).toContain(textA)
  expect(lines.slice(separator + 1).join('\n')).toContain(textG)
})

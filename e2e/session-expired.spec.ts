import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const TOKEN_KEY = 'writespark.session_token'
const DEVICE_KEY = 'writespark.device_id'

/** Start every page load with an unknown session token and a known guest device id. */
async function seedBogusSession(page: Page) {
  const deviceId = `guest_${randomBytes(16).toString('hex')}`
  await page.addInitScript(
    ([tokenKey, deviceKey, device]) => {
      window.localStorage.setItem(tokenKey, 'bogus-token-1234567890')
      window.localStorage.setItem(deviceKey, device)
    },
    [TOKEN_KEY, DEVICE_KEY, deviceId] as const,
  )
  return deviceId
}

function readStorage(page: Page, key: string) {
  return page.evaluate((k) => window.localStorage.getItem(k), key)
}

test('journal: an expired session is shown, not silently continued as a guest', async ({ page }) => {
  const seededDevice = await seedBogusSession(page)
  await page.goto('/')

  const banner = page.getByTestId('session-expired')
  await expect(banner).toBeVisible({ timeout: 10_000 })
  await expect(banner).toContainText('Your session has expired')
  await expect(banner.getByRole('link', { name: 'Log in again' })).toHaveAttribute('href', '/account')

  await expect(page.getByTestId('editor')).toBeDisabled()
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'expired')

  // Signed out locally, with a fresh guest id (same as logout on a shared device).
  await expect.poll(() => readStorage(page, TOKEN_KEY)).toBeNull()
  await expect.poll(() => readStorage(page, DEVICE_KEY)).not.toBe(seededDevice)

  // Still nothing writable after the autosave debounce.
  await page.waitForTimeout(1_500)
  await expect(page.getByTestId('editor')).toBeDisabled()
})

test('dashboard: an expired session is shown instead of guest stats', async ({ page }) => {
  await seedBogusSession(page)
  await page.goto('/dashboard')

  await expect(page.getByTestId('session-expired')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('dashboard-error')).toHaveCount(0)
  await expect.poll(() => readStorage(page, TOKEN_KEY)).toBeNull()
})

import { expect, test } from '@playwright/test'

test('previous day is locked, read-only, and does not save', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('editor')).toBeEnabled()

  await page.getByRole('button', { name: '← Previous' }).click()

  await expect(page.getByTestId('lock-banner')).toBeVisible()
  await expect(page.getByTestId('lock-banner')).toContainText('This day is locked')
  await expect(page.getByTestId('editor')).toBeDisabled()

  await page.waitForTimeout(2_000)
  await expect(page.getByTestId('save-status')).toHaveText('Locked')
  await expect(page.getByTestId('save-error')).toHaveCount(0)
})

import { expect, test } from '@playwright/test'

test('opening the editor does not create an empty entry', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('editor')).toBeEnabled()

  // Longer than the autosave debounce.
  await page.waitForTimeout(2_000)
  await expect(page.getByTestId('save-status')).not.toHaveAttribute('data-state', 'error')

  await page.goto('/dashboard')
  await expect(page.getByTestId('stat-days-written')).toHaveText('0')
  await expect(page.getByTestId('dashboard-error')).toHaveCount(0)
})

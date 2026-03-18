import { expect, test } from '@playwright/test'

test('autosave succeeds for normal editor flow', async ({ page }) => {
  await page.goto('/')

  const editor = page.locator('textarea')
  await expect(editor).toBeVisible()

  await editor.fill(`Autosave test ${Date.now()} works`)

  await expect(page.locator('text=Saved')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=Save failed')).toHaveCount(0)
})

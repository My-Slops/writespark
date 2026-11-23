import { expect, test } from '@playwright/test'

test('autosave succeeds for normal editor flow', async ({ page }) => {
  await page.goto('/')

  const editor = page.getByTestId('editor')
  await expect(editor).toBeEnabled()

  await editor.fill(`Autosave test ${Date.now()} works`)

  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 })
  await expect(page.getByTestId('save-error')).toHaveCount(0)
})

import { expect, test } from '@playwright/test'

test('autosave succeeds for normal editor flow', async ({ page }) => {
  await page.goto('/')

  const editor = page.getByTestId('editor')
  await expect(editor).toBeEnabled()

  await editor.fill(`Autosave test ${Date.now()} works`)

  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 })
  await expect(page.getByTestId('save-error')).toHaveCount(0)
})

test('text typed right before changing day is saved, not dropped', async ({ page }) => {
  await page.goto('/')

  const editor = page.getByTestId('editor')
  await expect(editor).toBeEnabled()

  const text = `Flush test ${Date.now()}`
  await editor.fill(text)
  // Leave immediately, well inside the autosave debounce.
  await page.getByRole('button', { name: '← Previous' }).click()
  await expect(page.getByTestId('lock-banner')).toBeVisible()

  const next = page.getByRole('button', { name: 'Next →' })
  await expect(next).toBeEnabled()
  await next.click()

  await expect(editor).toBeEnabled()
  await expect(editor).toHaveValue(text)
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'idle')
})

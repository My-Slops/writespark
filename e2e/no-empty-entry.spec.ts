import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('opening the editor does not create an empty entry', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('editor')).toBeEnabled()

  // Longer than the autosave debounce.
  await page.waitForTimeout(2_000)
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'idle')

  // The JSON export returns every stored row for this identity, including 0-word ones.
  await page.goto('/history')
  const exportButton = page.getByTestId('export-json')
  await expect(exportButton).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise

  const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as { entries: Array<unknown> }
  expect(exported.entries).toEqual([])
  await expect(page.getByTestId('export-error')).toHaveCount(0)
})

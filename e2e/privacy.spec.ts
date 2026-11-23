import { expect, test  } from '@playwright/test'
import type {Page} from '@playwright/test';

const PASSWORD = 'correct-horse-battery'

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

test('entries are private per account and survive log out / log in', async ({ page }) => {
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const emailA = `user-a-${run}@example.com`
  const emailB = `user-b-${run}@example.com`
  const textA = `Private text of user A ${run}`

  await authenticate(page, 'Sign up', emailA)

  await page.goto('/')
  const editor = page.getByTestId('editor')
  await expect(editor).toBeEnabled()
  await editor.fill(textA)
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 })

  await logout(page)

  await authenticate(page, 'Sign up', emailB)
  await page.goto('/')
  await expect(editor).toBeEnabled()
  await expect(editor).toHaveValue('')

  await logout(page)

  await authenticate(page, 'Log in', emailA)
  await page.goto('/')
  await expect(editor).toBeEnabled()
  await expect(editor).toHaveValue(textA)
})

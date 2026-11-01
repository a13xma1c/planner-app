import { test as base, expect } from '@playwright/test'

import { signUp } from './fixtures'

base('sign up, sign out and sign back in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole('link', { name: 'Create one' }).click()
  const email = `e2e-${Date.now()}@example.com`
  await page.getByLabel('Your name').fill('E2E Person')
  await page.getByLabel('Email').fill(email)
  const password = page.getByLabel('Password', { exact: true })
  const create = page.getByRole('button', { name: 'Create account' })

  // live policy feedback: weak / personal / strong
  await password.fill('password123')
  await expect(page.getByTestId('password-label')).toHaveText('Very weak')
  await expect(page.getByTestId('check-common')).toHaveAttribute('data-passed', 'false')
  await expect(create).toBeDisabled()
  await password.fill('e2e-person-2030')
  await expect(page.getByTestId('check-personal')).toHaveAttribute('data-passed', 'false')
  await expect(create).toBeDisabled()
  await password.fill('orbit-cactus-lantern-7')
  await expect(page.getByTestId('password-label')).toHaveText('Strong')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await create.click()
  await expect(page).toHaveURL(/\/w\/\d+$/)
  await expect(page.getByTestId('workspace-switcher')).toContainText("E2E Person's planner")

  await page.getByTestId('user-menu').click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password')
  await page.getByLabel('Password').fill('orbit-cactus-lantern-7')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/w\/\d+$/)
})

base('protected pages redirect to login and come back afterwards', async ({ page }) => {
  const account = await signUp(page, 'Redirect')
  await page.request.post('/api/auth/logout')
  await page.goto(`/w/${account.workspaceId}/board`)
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`/w/${account.workspaceId}/board$`))
})

base('account settings: rename and change password', async ({ page }) => {
  const account = await signUp(page, 'Settings')
  await page.goto(`/w/${account.workspaceId}/settings`)
  const name = page.getByLabel('Display name')
  await name.fill('Renamed Person')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Name updated' })).toBeVisible()

  await page.getByLabel('Current password').fill(account.password)
  await page.getByLabel('New password').fill('velvet-otter-glacier-3')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible()
  const r = await page.request.post('/api/auth/login', {
    data: { email: account.email, password: 'velvet-otter-glacier-3' },
  })
  expect(r.ok()).toBeTruthy()
})

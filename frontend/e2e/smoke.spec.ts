import { expect, test } from '@playwright/test'

import { resetDatabase } from './helpers'

test.beforeEach(async ({ request }) => resetDatabase(request))

test('loads the dashboard and navigates between pages', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Planner')
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
  await expect(page.getByTestId('stat-open')).toHaveText('0')

  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  // Sequential on purpose: each click navigates before the next assertion.
  for (const [label, heading] of [
    ['Inbox', 'Inbox'],
    ['Today', 'Today'],
    ['Upcoming', 'Upcoming'],
    ['All tasks', 'All tasks'],
    ['Board', 'Board'],
    ['Calendar', 'Calendar'],
    ['Tags', 'Tags'],
    ['Settings', 'Settings'],
  ] as const) {
    await nav.getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
})

test('client-side routes survive a full reload (SPA fallback)', async ({ page }) => {
  await page.goto('/board')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await page.goto('/does-not-exist')
  await expect(page.getByText('Page not found')).toBeVisible()
})

test('API docs are served', async ({ request }) => {
  const r = await request.get('/api/openapi.json')
  expect(r.ok()).toBeTruthy()
  expect((await r.json()).info.title).toBe('Planner API')
})

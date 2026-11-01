import { expect, test } from './fixtures'

test('loads the dashboard and navigates between pages', async ({ page, ws }) => {
  await page.goto(ws)
  await expect(page).toHaveTitle('Planner')
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
  await expect(page.getByTestId('stat-open')).toHaveText('0')

  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  for (const [label, heading] of [
    ['Inbox', 'Inbox'],
    ['Today', 'Today'],
    ['Upcoming', 'Upcoming'],
    ['All tasks', 'All tasks'],
    ['Board', 'Board'],
    ['Calendar', 'Calendar'],
    ['Members', 'Members'],
    ['Tags', 'Tags'],
    ['Settings', 'Settings'],
  ] as const) {
    // Sequential on purpose: each click navigates before the next assertion.
    await nav.getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
})

test('client-side routes survive a full reload (SPA fallback)', async ({ page, ws }) => {
  await page.goto(`${ws}/board`)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await page.goto(`${ws}/does-not-exist`)
  await expect(page.getByText('Page not found')).toBeVisible()
})

test('the root redirects into the last-used planner and old bookmarks still work', async ({
  page,
  ws,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(new RegExp(`${ws}$`))
  await page.goto('/board?project=inbox')
  await expect(page).toHaveURL(new RegExp(`${ws}/board\\?project=inbox$`))
})

test('API docs are served', async ({ page }) => {
  const r = await page.request.get('/api/openapi.json')
  expect(r.ok()).toBeTruthy()
  expect((await r.json()).info.title).toBe('Planner API')
})

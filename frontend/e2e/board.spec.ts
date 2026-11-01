import type { Locator, Page } from '@playwright/test'

import { createTask, expect, getTask, test } from './fixtures'

/**
 * Drag using the card's grip handle with intermediate mouse moves so dnd-kit registers it,
 * then wait for the reorder request, the refetch it triggers, and the drop animation to finish.
 */
async function drag(page: Page, handle: Locator, target: Locator) {
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  const reordered = page.waitForResponse((r) => r.url().includes('/api/tasks/reorder'))
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10)
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 40), { steps: 12 })
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 40) + 1)
  const refetched = page.waitForResponse(
    (r) => r.request().method() === 'GET' && r.url().includes('/api/tasks?'),
  )
  await page.mouse.up()
  expect((await reordered).ok()).toBeTruthy()
  await refetched
  // the drop animation overlay briefly covers the card; wait until it is gone
  await expect(page.getByTestId('drag-overlay')).toHaveCount(0)
}

test('dragging a card to another column changes its status', async ({ page, ws }) => {
  const task = await createTask(page.request, { title: 'Move me' })
  await page.goto(`${ws}/board`)
  const card = page.getByTestId('board-card').filter({ hasText: 'Move me' })
  await expect(page.getByTestId('column-todo')).toContainText('Move me')

  await drag(
    page,
    card.getByRole('button', { name: 'Drag Move me' }),
    page.getByTestId('column-in_progress'),
  )

  await expect(page.getByTestId('column-in_progress')).toContainText('Move me')
  await expect.poll(async () => (await getTask(page.request, task.id)).status).toBe('in_progress')

  // moving into Done completes the task
  await drag(
    page,
    page
      .getByTestId('board-card')
      .filter({ hasText: 'Move me' })
      .getByRole('button', { name: 'Drag Move me' }),
    page.getByTestId('column-done'),
  )
  await expect(page.getByTestId('column-done')).toContainText('Move me')
  await expect.poll(async () => (await getTask(page.request, task.id)).status).toBe('done')
})

test('reordering within a column persists positions', async ({ page, ws }) => {
  const a = await createTask(page.request, { title: 'First' })
  const b = await createTask(page.request, { title: 'Second' })
  await page.goto(`${ws}/board`)
  const col = page.getByTestId('column-todo')
  const cards = col.getByTestId('board-card')
  await expect(cards).toHaveText([/First/, /Second/])

  await drag(page, cards.nth(1).getByRole('button', { name: 'Drag Second' }), cards.nth(0))
  await expect(cards).toHaveText([/Second/, /First/])
  await expect.poll(async () => (await getTask(page.request, b.id)).position).toBe(0)
  await expect.poll(async () => (await getTask(page.request, a.id)).position).toBe(1)

  await page.reload()
  await expect(col.getByTestId('board-card')).toHaveText([/Second/, /First/])
})

test('board can be filtered by project', async ({ page, ws }) => {
  const r = await page.request.post('/api/projects', { data: { name: 'Only' } })
  const project = await r.json()
  await createTask(page.request, { title: 'In project', project_id: project.id })
  await createTask(page.request, { title: 'Elsewhere' })
  await page.goto(`${ws}/board`)
  await expect(page.getByTestId('board-card')).toHaveCount(2)
  await page.getByLabel('Filter board by project').selectOption(String(project.id))
  await expect(page.getByTestId('board-card')).toHaveCount(1)
  await expect(page).toHaveURL(/project=\d+/)
})

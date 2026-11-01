import { expect, test } from '@playwright/test'

import {
  createProject,
  createTask,
  getTask,
  isoDaysFromNow,
  quickAdd,
  resetDatabase,
} from './helpers'

test.beforeEach(async ({ request }) => resetDatabase(request))

test('quick-add parses natural language and the task shows up with badges', async ({
  page,
  request,
}) => {
  await createProject(request, 'Home')
  await page.goto('/tasks')
  const input = page.getByLabel('Quick add task')
  await input.fill('Pay rent tomorrow !high #finance @Home ~1h')
  const preview = page.getByTestId('quick-add-preview')
  await expect(preview).toContainText('Pay rent')
  await expect(preview).toContainText('@Home')
  await expect(preview).toContainText('Tomorrow')
  await input.press('Enter')

  const row = page.getByTestId('task-row').filter({ hasText: 'Pay rent' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Home')
  await expect(row).toContainText('Tomorrow')
  await expect(row).toContainText('P2')
  await expect(row).toContainText('1h')
  await expect(row).toContainText('#finance')
  await expect(input).toHaveValue('')
})

test('open, edit, complete and delete a task through the detail panel', async ({
  page,
  request,
}) => {
  const task = await createTask(request, { title: 'Edit me', notes: 'original' })
  await page.goto('/tasks')
  await page.getByRole('button', { name: 'Open Edit me' }).click()
  await expect(page).toHaveURL(/task=\d+/)
  const panel = page.getByTestId('task-panel')

  const title = panel.getByLabel('Task title')
  await title.fill('Edited title')
  await title.press('Enter')
  await expect(page.getByTestId('task-row').filter({ hasText: 'Edited title' })).toBeVisible()

  await panel.getByLabel('Priority').selectOption('urgent')
  await panel.getByLabel('Due date').fill(isoDaysFromNow(0))
  await expect(panel.getByText('Today', { exact: true })).toBeVisible()

  await panel.getByLabel('New subtask').fill('first step')
  await panel.getByLabel('New subtask').press('Enter')
  await expect(panel.getByLabel('Subtask first step', { exact: true })).toBeVisible()
  await panel.getByRole('checkbox', { name: 'Check first step' }).click()
  await expect(panel.getByText('1/1')).toBeVisible()

  await panel.getByLabel('Tags').fill('urgent-ish')
  await panel.getByLabel('Tags').press('Enter')
  await expect(panel.getByText('#urgent-ish')).toBeVisible()

  await expect.poll(async () => (await getTask(request, task.id)).status).toBe('todo')
  await panel.getByTestId('panel-toggle-done').click()
  await expect(panel.getByRole('button', { name: 'Reopen' })).toBeVisible()
  await expect.poll(async () => (await getTask(request, task.id)).status).toBe('done')

  await panel.getByRole('button', { name: 'Delete task' }).click()
  await page
    .getByRole('dialog', { name: 'Delete this task?' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(panel).toBeHidden()
  await expect(page.getByText('No tasks here')).toBeVisible()
})

test('completing a recurring task spawns the next occurrence', async ({ page, request }) => {
  await createTask(request, {
    title: 'Water plants',
    recurrence: 'daily',
    due_date: isoDaysFromNow(0),
  })
  await page.goto('/today')
  await page.getByRole('checkbox', { name: 'Complete Water plants' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Next occurrence: Tomorrow' }),
  ).toBeVisible()
  await page.goto('/upcoming')
  await expect(
    page.getByRole('region', { name: /^Tomorrow/ }).getByText('Water plants'),
  ).toBeVisible()
})

test('filters, search and bulk actions', async ({ page, request }) => {
  await createTask(request, { title: 'Alpha report', priority: 'high' })
  await createTask(request, { title: 'Beta cleanup', priority: 'low' })
  await createTask(request, { title: 'Gamma done', status: 'done' })
  await page.goto('/tasks')
  const rows = page.getByTestId('task-row')
  await expect(rows).toHaveCount(2)

  await page.getByLabel('Show completed').check()
  await expect(rows).toHaveCount(3)
  await expect(page).toHaveURL(/done=1/)

  await page.getByRole('button', { name: 'High', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Alpha report')
  await page.getByRole('button', { name: /Clear/ }).click()

  await page.getByTestId('search-input').fill('beta')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Beta cleanup')
  await page.getByTestId('search-input').fill('')
  await expect(rows).toHaveCount(2)

  // bulk complete everything
  await rows.first().hover()
  await page.getByRole('checkbox', { name: 'Select Alpha report' }).click()
  await page.getByRole('button', { name: 'Select all 2' }).click()
  await page.getByTestId('bulk-bar').getByRole('button', { name: 'Complete' }).click()
  await expect(page.getByText('No tasks here')).toBeVisible()
  const r = await request.get('/api/tasks?status=done')
  expect((await r.json()).length).toBe(3)
})

test('the New task form creates a fully specified task', async ({ page, request }) => {
  await page.goto('/')
  await page.getByTestId('new-task-button').click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Title').fill('Formal task')
  await dialog.getByLabel('Priority').selectOption('low')
  await dialog.getByLabel('Checklist').fill('one\ntwo')
  await dialog.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByTestId('task-panel').getByLabel('Task title')).toHaveValue('Formal task')
  const tasks = await (await request.get('/api/tasks')).json()
  expect(tasks[0].subtasks.map((s: { title: string }) => s.title)).toEqual(['one', 'two'])
})

test('keyboard shortcuts', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('n')
  await expect(page.getByLabel('Quick add task')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { level: 1 }).click() // blur the input
  await page.keyboard.press('g')
  await page.keyboard.press('b')
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts & syntax' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('quick-added tasks are not auto-opened but can be opened from the toast', async ({ page }) => {
  await page.goto('/inbox')
  await quickAdd(page, 'Toast me')
  await expect(page.getByTestId('task-panel')).toBeHidden()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByTestId('task-panel').getByLabel('Task title')).toHaveValue('Toast me')
})

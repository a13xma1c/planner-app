import { expect, test } from '@playwright/test'

import { createTask, resetDatabase } from './helpers'

test.beforeEach(async ({ request }) => resetDatabase(request))

test('dark mode persists across reloads', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('export downloads a bundle that can be re-imported', async ({ page, request }) => {
  await createTask(request, { title: 'Keep me', tags: ['x'], subtasks: ['s'] })
  await page.goto('/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-button').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/planner-export-\d{4}-\d{2}-\d{2}\.json/)
  const path = await download.path()
  const { readFile } = await import('node:fs/promises')
  const bundle = JSON.parse(await readFile(path!, 'utf8'))
  expect(bundle.tasks).toHaveLength(1)

  await resetDatabase(request)
  await page.getByRole('button', { name: 'Import (merge)' }).click()
  await page.getByTestId('import-bundle-input').setInputFiles({
    name: 'bundle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  })
  await expect(page.getByTestId('import-result')).toContainText('1 tasks')
  const tasks = await (await request.get('/api/tasks')).json()
  expect(tasks[0].title).toBe('Keep me')
  expect(tasks[0].subtasks).toHaveLength(1)
})

test('legacy CLI data can be imported', async ({ page }) => {
  await page.goto('/settings')
  const legacy = {
    tasks: [
      {
        id: 1,
        title: 'Old task',
        project: 'Work',
        priority: 'high',
        status: 'todo',
        due_date: '2030-01-01',
        notes: '',
      },
      { id: 2, title: 'Old done', project: 'Inbox', priority: 'low', status: 'done' },
    ],
    projects: [{ name: 'Inbox' }, { name: 'Work', description: 'Job' }],
    next_id: 3,
  }
  await page.getByRole('button', { name: 'Import legacy file' }).click()
  await page.getByTestId('import-legacy-input').setInputFiles({
    name: 'planner_data.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  })
  await expect(page.getByTestId('import-result')).toContainText('2 tasks, 1 projects')
  await expect(page.getByTestId('sidebar-projects')).toContainText('Work')
  await page.goto('/tasks?done=1')
  await expect(page.getByTestId('task-row')).toHaveCount(2)
})

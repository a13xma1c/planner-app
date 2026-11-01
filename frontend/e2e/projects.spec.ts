import { createTask, expect, getTask, quickAdd, test } from './fixtures'

test('create a project, add tasks to it, then delete it (tasks move to Inbox)', async ({
  page,
  ws,
}) => {
  await page.goto(ws)
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabel('Name').fill('Garden')
  await dialog.getByRole('radio', { name: '#10b981' }).click()
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(page).toHaveURL(new RegExp(`${ws}/projects/\\d+`))
  await expect(page.getByRole('heading', { level: 1, name: 'Garden' })).toBeVisible()
  await expect(page.getByTestId('sidebar-projects')).toContainText('Garden')

  await quickAdd(page, 'Plant tomatoes @Garden')
  const row = page.getByTestId('task-row').filter({ hasText: 'Plant tomatoes' })
  await expect(row).toBeVisible()
  const [task] = await (await page.request.get('/api/tasks')).json()
  expect(task.project.name).toBe('Garden')

  await page.getByRole('button', { name: 'Delete project' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
  await expect.poll(async () => (await getTask(page.request, task.id)).project_id).toBeNull()
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(page.getByTestId('task-row').filter({ hasText: 'Plant tomatoes' })).toBeVisible()
})

test('projects page shows progress and supports archiving', async ({ page, ws }) => {
  const r = await page.request.post('/api/projects', { data: { name: 'Half done' } })
  const p = await r.json()
  await createTask(page.request, { title: 'a', project_id: p.id, status: 'done' })
  await createTask(page.request, { title: 'b', project_id: p.id })
  await page.goto(`${ws}/projects`)
  const card = page.getByTestId('project-grid').getByRole('link', { name: /Half done/ })
  await expect(card).toContainText('1/2 done')
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')

  await card.click()
  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('Archived')).toBeVisible()
  await expect(page.getByTestId('sidebar-projects')).not.toContainText('Half done')
  await page.goto(`${ws}/projects`)
  await expect(page.getByTestId('project-grid')).not.toContainText('Half done')
  await page.getByLabel('Show archived').check()
  await expect(page.getByTestId('project-grid')).toContainText('Half done')
})

test('tags page manages tags used by tasks', async ({ page, ws }) => {
  await createTask(page.request, { title: 'tagged', tags: ['focus'] })
  await page.goto(`${ws}/tags`)
  const table = page.getByTestId('tags-table')
  await expect(table.getByRole('link', { name: '1' })).toBeVisible()
  await page.getByLabel('New tag name').fill('later')
  await page.getByLabel('New tag name').press('Enter')
  await expect(table.getByLabel('Rename tag later')).toBeVisible()
  await page.getByRole('button', { name: 'Delete tag later' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete tag' }).click()
  await expect(table.getByLabel('Rename tag later')).toBeHidden()
  await table.getByRole('link', { name: '1' }).click()
  await expect(page.getByTestId('task-row').filter({ hasText: 'tagged' })).toBeVisible()
})

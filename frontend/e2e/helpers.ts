import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** Wipe the database between tests via the import-with-replace endpoint. */
export async function resetDatabase(request: APIRequestContext): Promise<void> {
  const r = await request.post('/api/data/import?replace=true', { data: { version: 2 } })
  expect(r.ok()).toBeTruthy()
}

export async function createProject(request: APIRequestContext, name: string, color = '#0ea5e9') {
  const r = await request.post('/api/projects', { data: { name, color } })
  expect(r.status()).toBe(201)
  return (await r.json()) as { id: number; name: string }
}

export async function createTask(
  request: APIRequestContext,
  data: { title: string } & Record<string, unknown>,
) {
  const r = await request.post('/api/tasks', { data })
  expect(r.status()).toBe(201)
  return (await r.json()) as {
    id: number
    title: string
    status: string
    due_date: string | null
    position: number
  }
}

export async function getTask(request: APIRequestContext, id: number) {
  const r = await request.get(`/api/tasks/${id}`)
  expect(r.ok()).toBeTruthy()
  return (await r.json()) as {
    id: number
    title: string
    status: string
    due_date: string | null
    position: number
    project_id: number | null
  }
}

export function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export async function quickAdd(page: Page, text: string): Promise<void> {
  const input = page.getByLabel('Quick add task')
  await input.fill(text)
  await input.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toBeVisible()
}

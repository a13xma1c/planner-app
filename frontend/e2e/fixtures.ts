import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

export interface Account {
  email: string
  password: string
  name: string
  workspaceId: number
}

let counter = 0

/** Register a fresh account through the API using the page's cookie jar (so the page is signed in). */
export async function signUp(page: Page, name = 'Tester'): Promise<Account> {
  const email = `${name.toLowerCase().replace(/\s+/g, '')}-${Date.now()}-${counter++}@example.com`
  const password = 'orbit-cactus-lantern-7'
  const r = await page.request.post('/api/auth/register', {
    data: { email, password, display_name: name },
  })
  expect(r.status(), await r.text()).toBe(201)
  const spaces = await (await page.request.get('/api/workspaces')).json()
  return { email, password, name, workspaceId: spaces[0].id }
}

/**
 * Every test gets its own account (and therefore its own empty personal planner), which
 * isolates tests without resetting the database. `ws` is the planner's URL prefix.
 */
export const test = base.extend<{ account: Account; ws: string }>({
  account: async ({ page }, provide) => {
    await provide(await signUp(page))
  },
  ws: async ({ account }, provide) => {
    await provide(`/w/${account.workspaceId}`)
  },
})

export { expect }

export async function createProject(request: APIRequestContext, name: string, color = '#0ea5e9') {
  const r = await request.post('/api/projects', { data: { name, color } })
  expect(r.status()).toBe(201)
  return (await r.json()) as { id: number; name: string }
}

export async function createTask(
  request: APIRequestContext,
  data: { title: string } & Record<string, unknown>,
  workspaceId?: number,
) {
  const r = await request.post('/api/tasks', {
    data,
    headers: workspaceId ? { 'X-Workspace-Id': String(workspaceId) } : {},
  })
  expect(r.status(), await r.text()).toBe(201)
  return (await r.json()) as {
    id: number
    title: string
    status: string
    due_date: string | null
    position: number
  }
}

export async function getTask(request: APIRequestContext, id: number, workspaceId?: number) {
  const r = await request.get(`/api/tasks/${id}`, {
    headers: workspaceId ? { 'X-Workspace-Id': String(workspaceId) } : {},
  })
  expect(r.ok()).toBeTruthy()
  return (await r.json()) as {
    id: number
    title: string
    status: string
    due_date: string | null
    position: number
    project_id: number | null
    assignee_id: number | null
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

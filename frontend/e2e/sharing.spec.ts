import { test as base, expect, type Page } from '@playwright/test'

import { createTask, signUp, type Account } from './fixtures'

/** Two people in two browser contexts sharing one planner. */
const test = base.extend<{
  alice: { page: Page; account: Account }
  bob: { page: Page; account: Account }
}>({
  alice: async ({ browser }, provide) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await provide({ page, account: await signUp(page, 'Alice') })
    await context.close()
  },
  bob: async ({ browser }, provide) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await provide({ page, account: await signUp(page, 'Bob') })
    await context.close()
  },
})

async function createSharedPlanner(page: Page, name: string): Promise<number> {
  await page.getByTestId('workspace-switcher').click()
  await page.getByRole('button', { name: 'New shared planner' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create planner' }).click()
  await expect(page).toHaveURL(/\/w\/(\d+)\/members$/)
  return Number(/\/w\/(\d+)\/members$/.exec(page.url())![1])
}

async function createInviteLink(page: Page, role: 'editor' | 'viewer' = 'editor'): Promise<string> {
  await page.getByLabel('Role', { exact: true }).selectOption(role)
  await page.getByRole('button', { name: 'Create link' }).click()
  const link = await page.getByTestId('invitation-list').locator('.font-mono').first().innerText()
  return link.replace(/^https?:\/\/[^/]+/, '')
}

test('invite a collaborator who then sees and edits the shared planner, live', async ({
  alice,
  bob,
}) => {
  await alice.page.goto(`/w/${alice.account.workspaceId}`)
  const sharedId = await createSharedPlanner(alice.page, 'Family')
  const link = await createInviteLink(alice.page, 'editor')

  // Bob follows the link while signed in
  await bob.page.goto(link)
  await expect(bob.page.getByRole('heading', { name: 'Join "Family"' })).toBeVisible()
  await expect(bob.page.getByText(/Alice invited you to collaborate as editor/)).toBeVisible()
  await bob.page.getByRole('button', { name: 'Join as Bob' }).click()
  await expect(bob.page).toHaveURL(new RegExp(`/w/${sharedId}$`))
  await expect(bob.page.getByTestId('workspace-switcher')).toContainText('2 members · Editor')

  // Alice's member list updates without a reload
  await expect(alice.page.getByTestId('member-list')).toContainText('Bob')

  // Alice adds a task; Bob sees it appear live
  await bob.page.goto(`/w/${sharedId}/tasks`)
  await expect(bob.page.getByText('No tasks here')).toBeVisible()
  await alice.page.goto(`/w/${sharedId}/tasks`)
  await alice.page.getByLabel('Quick add task').fill('Buy groceries tomorrow !high')
  await alice.page.getByLabel('Quick add task').press('Enter')
  const row = bob.page.getByTestId('task-row').filter({ hasText: 'Buy groceries' })
  await expect(row).toBeVisible({ timeout: 10_000 })

  // Bob assigns it to Alice and comments; Alice sees both
  await bob.page.getByRole('button', { name: 'Open Buy groceries' }).click()
  const panel = bob.page.getByTestId('task-panel')
  await panel.getByLabel('Assignee').selectOption({ label: 'Alice' })
  await panel.getByLabel('New comment').fill('I can do this on Saturday')
  await panel.getByRole('button', { name: 'Comment' }).click()
  await expect(panel.getByText('I can do this on Saturday')).toBeVisible()

  await alice.page.goto(`/w/${sharedId}/assigned`)
  await expect(
    alice.page.getByTestId('task-row').filter({ hasText: 'Buy groceries' }),
  ).toBeVisible()
  await expect(alice.page.getByLabel('1 comments')).toBeVisible()
  await alice.page.goto(`/w/${sharedId}`)
  await expect(alice.page.getByTestId('team-load')).toContainText('Alice')

  // Alice's personal planner stays private
  const r = await bob.page.request.get('/api/tasks', {
    headers: { 'X-Workspace-Id': String(alice.account.workspaceId) },
  })
  expect(r.status()).toBe(404)
})

test('viewers get a read-only experience', async ({ alice, bob }) => {
  await alice.page.goto(`/w/${alice.account.workspaceId}`)
  const sharedId = await createSharedPlanner(alice.page, 'Read only')
  await createTask(alice.page.request, { title: 'Look only' }, sharedId)
  const link = await createInviteLink(alice.page, 'viewer')

  await bob.page.goto(link)
  await bob.page.getByRole('button', { name: 'Join as Bob' }).click()
  await expect(bob.page).toHaveURL(new RegExp(`/w/${sharedId}$`))
  await expect(bob.page.getByTestId('view-only-banner')).toBeVisible()
  await expect(bob.page.getByLabel('Quick add task')).toHaveCount(0)
  await bob.page.goto(`/w/${sharedId}/tasks`)
  await expect(bob.page.getByRole('checkbox', { name: 'Complete Look only' })).toBeDisabled()
  const r = await bob.page.request.post('/api/tasks', {
    data: { title: 'nope' },
    headers: { 'X-Workspace-Id': String(sharedId) },
  })
  expect(r.status()).toBe(403)

  // the owner promotes Bob; his UI unlocks after the live member update
  await alice.page.getByLabel('Role for Bob').selectOption('editor')
  await expect(bob.page.getByLabel('Quick add task')).toBeVisible({ timeout: 10_000 })
})

test('members can leave and owners can revoke links', async ({ alice, bob }) => {
  await alice.page.goto(`/w/${alice.account.workspaceId}`)
  const sharedId = await createSharedPlanner(alice.page, 'Temporary')
  const link = await createInviteLink(alice.page)
  await alice.page.getByRole('button', { name: 'Revoke invitation' }).click()
  await expect(alice.page.getByTestId('invitation-list')).toHaveCount(0)

  await bob.page.goto(link)
  await expect(bob.page.getByText(/expired or been revoked/)).toBeVisible()

  const fresh = await createInviteLink(alice.page)
  await bob.page.goto(fresh)
  await bob.page.getByRole('button', { name: 'Join as Bob' }).click()
  await bob.page.goto(`/w/${sharedId}/members`)
  await bob.page.getByRole('button', { name: 'Leave planner' }).click()
  await bob.page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click()
  await expect(bob.page).toHaveURL(new RegExp(`/w/${bob.account.workspaceId}$`))
  await bob.page.goto(`/w/${sharedId}`)
  await expect(bob.page.getByText("You're not a member of this planner")).toBeVisible()
})

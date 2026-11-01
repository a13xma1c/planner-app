/** Assignee & collaboration affordances across task components (shared planners only). */
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { db, ME, seedTask } from '@/test/fakeApi'
import { makeMember, makeTask, makeUser } from '@/test/fixtures'
import { renderApp, renderWithProviders } from '@/test/utils'

import { BulkBar } from './BulkBar'
import { FilterBar } from './FilterBar'
import { TaskDetailPanel } from './TaskDetailPanel'
import { TaskFormDialog } from './TaskFormDialog'
import { TaskRow } from './TaskRow'

const bob = makeUser({ id: 70, display_name: 'Bob Builder' })
const shared = {
  workspace: { id: 1, is_personal: false, member_count: 2 },
  members: [makeMember(ME, { role: 'owner' }), makeMember(bob)],
}

describe('assignee UI', () => {
  it('TaskRow shows the assignee avatar and comment count', () => {
    const task = makeTask({
      title: 'Shared',
      assignee: { id: bob.id, display_name: bob.display_name },
      assignee_id: bob.id,
      comment_count: 3,
    })
    renderWithProviders(
      <ul>
        <TaskRow task={task} onOpen={() => {}} onToggleDone={() => {}} />
      </ul>,
    )
    expect(screen.getByRole('img', { name: 'Bob Builder' })).toHaveTextContent('BB')
    expect(screen.getByLabelText('3 comments')).toBeInTheDocument()
  })

  it('FilterBar offers an assignee filter only in shared planners', async () => {
    const { unmount } = renderWithProviders(
      <FilterBar
        value={{
          search: '',
          status: [],
          priority: [],
          tag: [],
          sort: 'smart',
          order: 'asc',
          includeDone: false,
          assignee: '',
        }}
        onChange={() => {}}
      />,
    )
    expect(screen.queryByLabelText('Filter by assignee')).not.toBeInTheDocument()
    unmount()
    let last = ''
    renderWithProviders(
      <FilterBar
        value={{
          search: '',
          status: [],
          priority: [],
          tag: [],
          sort: 'smart',
          order: 'asc',
          includeDone: false,
          assignee: '',
        }}
        onChange={(f) => (last = f.assignee)}
      />,
      shared,
    )
    const select = screen.getByLabelText('Filter by assignee')
    expect(within(select).getByRole('option', { name: 'Bob Builder' })).toBeInTheDocument()
    await (await import('@testing-library/user-event')).default.selectOptions(select, 'me')
    expect(last).toBe('me')
  })

  it('TaskDetailPanel assigns a member', async () => {
    db.users.push(bob)
    db.members.push({ ...makeMember(bob), workspace_id: 1 })
    const task = seedTask({ title: 'Assign me' })
    const { user } = renderWithProviders(
      <TaskDetailPanel taskId={task.id} onClose={() => {}} />,
      shared,
    )
    await user.selectOptions(await screen.findByLabelText('Assignee'), String(bob.id))
    await waitFor(() => expect(db.tasks[0]!.assignee_id).toBe(bob.id))
    await waitFor(() => expect(screen.getByLabelText('Assignee')).toHaveValue(String(bob.id)))
  })

  it('TaskFormDialog creates an assigned task', async () => {
    db.users.push(bob)
    const { user } = renderWithProviders(<TaskFormDialog open onClose={() => {}} />, shared)
    await user.type(screen.getByLabelText('Title'), 'For Bob')
    await user.selectOptions(screen.getByLabelText('Assignee'), String(bob.id))
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(db.tasks[0]!.assignee_id).toBe(bob.id))
  })

  it('BulkBar assigns and unassigns', async () => {
    db.users.push(bob)
    const a = seedTask({ title: 'a' })
    const { user } = renderWithProviders(
      <BulkBar selectedIds={[a.id]} onClear={() => {}} />,
      shared,
    )
    await user.selectOptions(screen.getByLabelText('Assign to'), String(bob.id))
    await waitFor(() => expect(db.tasks[0]!.assignee_id).toBe(bob.id))
    await user.selectOptions(screen.getByLabelText('Assign to'), 'none')
    await waitFor(() => expect(db.tasks[0]!.assignee_id).toBeNull())
  })

  it('"Assigned to me" view and sidebar entry appear for shared planners', async () => {
    const { seedWorkspace } = await import('@/test/fakeApi')
    const ws = seedWorkspace({ name: 'Team' }, [{ user: bob }])
    seedTask({ title: 'Mine', assignee_id: ME.id }, ws.id)
    seedTask({ title: 'Bobs', assignee_id: bob.id }, ws.id)
    const { user } = renderApp(`/w/${ws.id}`)
    const link = await screen.findByRole('link', { name: /Assigned to me/ })
    await user.click(link)
    expect(await screen.findByRole('heading', { name: 'Assigned to me' })).toBeInTheDocument()
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Bobs')).not.toBeInTheDocument()
  })
})

describe('SettingsPage account section', () => {
  it('updates the name, changes the password and signs out', async () => {
    const { user, router } = renderApp('/w/1/settings')
    const name = await screen.findByLabelText('Display name')
    await user.clear(name)
    await user.type(name, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(db.currentUser?.display_name).toBe('Renamed'))

    await user.type(screen.getByLabelText('Current password'), 'nope-nope')
    const newPassword = screen.getByLabelText('New password')
    await user.type(newPassword, 'Renamed-2030')
    expect(screen.getByTestId('check-personal')).toHaveAttribute('data-passed', 'false')
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled()
    await user.clear(newPassword)
    await user.type(newPassword, 'velvet-otter-glacier-3')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()

    expect(screen.getByText(/Signed in on 1 other device/)).toBeInTheDocument()
    await user.click(screen.getByTestId('logout-button'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(db.currentUser).toBeNull()
  })
})

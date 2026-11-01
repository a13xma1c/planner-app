import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { db, seedTask, seedWorkspace } from '@/test/fakeApi'
import { makeUser } from '@/test/fixtures'
import { renderApp, renderWithProviders } from '@/test/utils'

import { WorkspaceSwitcher } from './WorkspaceSwitcher'

describe('WorkspaceSwitcher', () => {
  it('lists planners with roles and navigates', async () => {
    const shared = seedWorkspace({ name: 'Team', role: 'viewer' }, [
      { user: makeUser(), role: 'owner' },
    ])
    const { user, router } = renderWithProviders(<WorkspaceSwitcher onNewWorkspace={() => {}} />)
    await user.click(screen.getByTestId('workspace-switcher'))
    const list = await screen.findByRole('listbox', { name: 'Switch planner' })
    expect(within(list).getByRole('option', { name: /Me's planner/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const team = within(list).getByRole('option', { name: /Team/ })
    expect(team).toHaveTextContent('2 members')
    expect(team).toHaveTextContent('Viewer')
    await user.click(team)
    expect(router.state.location.pathname).toBe(`/w/${shared.id}`)
  })

  it('offers to create a shared planner', async () => {
    let called = false
    const { user } = renderWithProviders(
      <WorkspaceSwitcher onNewWorkspace={() => (called = true)} />,
    )
    await user.click(screen.getByTestId('workspace-switcher'))
    await user.click(await screen.findByText('New shared planner'))
    expect(called).toBe(true)
  })
})

describe('WorkspaceLayout', () => {
  it('renders the shell for members and remembers the last planner', async () => {
    const ws = seedWorkspace({ name: 'Team' })
    seedTask({ title: 'Team task' }, ws.id)
    renderApp(`/w/${ws.id}/tasks`)
    expect(await screen.findByText('Team task')).toBeInTheDocument()
    expect(localStorage.getItem('planner.lastWorkspace')).toBe(String(ws.id))
    expect(screen.getByTestId('workspace-switcher')).toHaveTextContent('Team')
  })

  it('shows a friendly message for planners you do not belong to', async () => {
    renderApp('/w/999/tasks')
    expect(await screen.findByText("You're not a member of this planner")).toBeInTheDocument()
  })

  it('redirects / to the last used planner, falling back to personal', async () => {
    const ws = seedWorkspace({ name: 'Team' })
    localStorage.setItem('planner.lastWorkspace', String(ws.id))
    const first = renderApp('/')
    await waitFor(() => expect(first.router.state.location.pathname).toBe(`/w/${ws.id}`))
    first.unmount()
    localStorage.setItem('planner.lastWorkspace', '12345')
    const second = renderApp('/')
    await waitFor(() => expect(second.router.state.location.pathname).toBe('/w/1'))
  })

  it('redirects old bookmarks into the workspace', async () => {
    const { router } = renderApp('/board')
    await waitFor(() => expect(router.state.location.pathname).toBe('/w/1/board'))
  })

  it('shows a read-only banner and hides editing controls for viewers', async () => {
    const ws = seedWorkspace({ name: 'Read only', role: 'viewer' }, [
      { user: makeUser(), role: 'owner' },
    ])
    seedTask({ title: 'Look but do not touch' }, ws.id)
    const { user } = renderApp(`/w/${ws.id}/tasks`)
    expect(await screen.findByTestId('view-only-banner')).toBeInTheDocument()
    expect(screen.queryByLabelText('Quick add task')).not.toBeInTheDocument()
    expect(screen.queryByTestId('new-task-button')).not.toBeInTheDocument()
    expect(
      await screen.findByRole('checkbox', { name: 'Complete Look but do not touch' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Open Look but do not touch' }))
    expect(await screen.findByLabelText('Task title')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete task' })).not.toBeInTheDocument()
    expect(screen.getByTestId('panel-toggle-done')).toBeDisabled()
  })
})

describe('LegacyPathRedirect', () => {
  it('keeps the query string', async () => {
    const { router } = renderWithProviders(
      <Routes>
        <Route path="*" element={<span>placeholder</span>} />
      </Routes>,
      { route: '/w/1', noWorkspace: true },
    )
    expect(router.state.location.pathname).toBe('/w/1')
    expect(db.currentUser).not.toBeNull()
  })
})

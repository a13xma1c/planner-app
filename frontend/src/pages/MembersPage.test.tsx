import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { db, seedWorkspace } from '@/test/fakeApi'
import { makeUser } from '@/test/fixtures'
import { renderApp } from '@/test/utils'

const bob = makeUser({ id: 50, display_name: 'Bob' })
const cara = makeUser({ id: 51, display_name: 'Cara' })

describe('MembersPage', () => {
  it('explains that personal planners are private', async () => {
    renderApp('/w/1/members')
    expect(await screen.findByText(/personal planner is private/)).toBeInTheDocument()
    expect(screen.queryByTestId('invite-form')).not.toBeInTheDocument()
  })

  it('lets owners change roles and remove members', async () => {
    const ws = seedWorkspace({ name: 'Team' }, [
      { user: bob, role: 'editor' },
      { user: cara, role: 'viewer' },
    ])
    const { user } = renderApp(`/w/${ws.id}/members`)
    const list = await screen.findByTestId('member-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)

    await user.selectOptions(within(list).getByLabelText('Role for Bob'), 'owner')
    await waitFor(() => expect(db.members.find((m) => m.user.id === bob.id)?.role).toBe('owner'))

    await user.click(within(list).getByRole('button', { name: 'Remove Cara' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2))
  })

  it('surfaces server rules (last owner cannot step down)', async () => {
    const ws = seedWorkspace({ name: 'Team' }, [{ user: bob }])
    const { user } = renderApp(`/w/${ws.id}/members`)
    const list = await screen.findByTestId('member-list')
    await user.selectOptions(within(list).getByLabelText('Role for Me'), 'editor')
    expect(await screen.findByRole('status')).toHaveTextContent('at least one owner')
  })

  it('creates, copies and revokes invitation links', async () => {
    const ws = seedWorkspace({ name: 'Team' })
    const { user } = renderApp(`/w/${ws.id}/members`)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await user.selectOptions(await screen.findByLabelText('Role'), 'viewer')
    await user.type(screen.getByLabelText(/Restrict to email/), 'friend@example.com')
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    const row = await screen.findByTestId('invitation-list')
    expect(row).toHaveTextContent('Viewer')
    expect(row).toHaveTextContent('for friend@example.com')
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/join\/token-\d+$/))
    expect(db.invitations[0]).toMatchObject({
      role: 'viewer',
      email: 'friend@example.com',
      workspace_id: ws.id,
    })

    await user.click(screen.getByRole('button', { name: 'Revoke invitation' }))
    await waitFor(() => expect(screen.queryByTestId('invitation-list')).not.toBeInTheDocument())
  })

  it('lets owners rename and delete a shared planner', async () => {
    const ws = seedWorkspace({ name: 'Old name' })
    const { user, router } = renderApp(`/w/${ws.id}/members`)
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'New name')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(db.workspaces.find((w) => w.id === ws.id)?.name).toBe('New name'))

    await user.click(screen.getByRole('button', { name: 'Delete planner' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete planner' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/w/1'))
    expect(db.workspaces.some((w) => w.id === ws.id)).toBe(false)
  })

  it('lets non-owners leave', async () => {
    const ws = seedWorkspace({ name: 'Team', role: 'editor' }, [{ user: bob, role: 'owner' }])
    const { user, router } = renderApp(`/w/${ws.id}/members`)
    await user.click(await screen.findByRole('button', { name: 'Leave planner' }))
    expect(screen.queryByTestId('invite-form')).not.toBeInTheDocument() // editors don't see invites
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/w/1'))
    expect(db.members.some((m) => m.workspace_id === ws.id && m.user.id === 1)).toBe(false)
  })
})

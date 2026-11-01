import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { db, ME, seedComment, seedTask } from '@/test/fakeApi'
import { makeMember, makeUser } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { Comments } from './Comments'

const bob = makeUser({ id: 60, display_name: 'Bob' })

describe('Comments', () => {
  it('lists, adds, edits and deletes comments', async () => {
    db.users.push(bob)
    const task = seedTask({ title: 'Discuss' })
    seedComment(task.id, bob, 'From Bob')
    const { user } = renderWithProviders(<Comments taskId={task.id} />, {
      workspace: { is_personal: false, member_count: 2 },
      members: [makeMember(ME, { role: 'owner' }), makeMember(bob)],
    })
    const section = screen.getByRole('region', { name: 'Comments' })
    expect(await within(section).findByText('From Bob')).toBeInTheDocument()

    await user.type(within(section).getByLabelText('New comment'), 'Mine')
    await user.click(within(section).getByRole('button', { name: 'Comment' }))
    expect(await within(section).findByText('Mine')).toBeInTheDocument()
    expect(db.comments).toHaveLength(2)

    // only my own comment is editable; as owner I can delete Bob's
    expect(within(section).getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    await user.click(within(section).getByRole('button', { name: 'Edit' }))
    const box = within(section).getByLabelText('Edit comment')
    await user.clear(box)
    await user.type(box, 'Mine (edited)')
    await user.click(within(section).getByRole('button', { name: 'Save' }))
    expect(await within(section).findByText('Mine (edited)')).toBeInTheDocument()
    expect(within(section).getByText(/· edited/)).toBeInTheDocument()

    const deletes = within(section).getAllByRole('button', { name: 'Delete comment' })
    expect(deletes).toHaveLength(2)
    await user.click(deletes[0]!)
    await waitFor(() => expect(db.comments).toHaveLength(1))
  })

  it('sends with Ctrl+Enter and hides the form for viewers', async () => {
    const task = seedTask({ title: 'T' })
    const { user, unmount } = renderWithProviders(<Comments taskId={task.id} />)
    await user.type(await screen.findByLabelText('New comment'), 'quick{Control>}{Enter}{/Control}')
    await waitFor(() => expect(db.comments.map((c) => c.body)).toEqual(['quick']))
    unmount()

    renderWithProviders(<Comments taskId={task.id} />, { workspace: { role: 'viewer' } })
    expect(await screen.findByText('quick')).toBeInTheDocument()
    expect(screen.queryByLabelText('New comment')).not.toBeInTheDocument()
  })
})

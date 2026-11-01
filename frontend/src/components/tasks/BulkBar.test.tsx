import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { db, seedProject, seedTask } from '@/test/fakeApi'
import { renderWithProviders } from '@/test/utils'

import { BulkBar } from './BulkBar'

describe('BulkBar', () => {
  it('renders nothing without a selection', () => {
    renderWithProviders(<BulkBar selectedIds={[]} onClear={() => {}} />)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('completes, re-prioritises, moves, and tags selected tasks', async () => {
    const a = seedTask({ title: 'a' })
    const b = seedTask({ title: 'b' })
    const project = seedProject({ name: 'Target' })
    const { user } = renderWithProviders(
      <BulkBar selectedIds={[a.id, b.id]} onClear={() => {}} onSelectAll={() => {}} total={5} />,
    )
    expect(screen.getByRole('toolbar')).toHaveTextContent('2 selected')
    expect(screen.getByRole('button', { name: 'Select all 5' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Complete/ }))
    await waitFor(() => expect(db.tasks.every((t) => t.status === 'done')).toBe(true))

    await user.selectOptions(screen.getByLabelText('Set priority'), 'urgent')
    await waitFor(() => expect(db.tasks.every((t) => t.priority === 'urgent')).toBe(true))

    await user.selectOptions(await screen.findByLabelText('Move to project'), String(project.id))
    await waitFor(() => expect(db.tasks.every((t) => t.project_id === project.id)).toBe(true))

    await user.selectOptions(screen.getByLabelText('Set due date'), 'none')
    await waitFor(() => expect(db.tasks.every((t) => t.due_date === null)).toBe(true))

    await user.type(screen.getByLabelText('Add tag to selected'), 'Q1{Enter}')
    await waitFor(() =>
      expect(db.tasks.every((t) => t.tags.some((x) => x.name === 'q1'))).toBe(true),
    )
  })

  it('deletes after confirmation and clears the selection', async () => {
    const a = seedTask({ title: 'a' })
    const onClear = vi.fn()
    const { user } = renderWithProviders(<BulkBar selectedIds={[a.id]} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: /Delete/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Delete 1 task?')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(db.tasks).toHaveLength(0))
    expect(onClear).toHaveBeenCalled()
  })
})

import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { db, seedProject } from '@/test/fakeApi'
import { renderWithProviders } from '@/test/utils'

import { QuickAdd } from './QuickAdd'

describe('QuickAdd', () => {
  it('previews parsed fields while typing and creates on Enter', async () => {
    seedProject({ name: 'Home' })
    const onCreated = vi.fn()
    const { user } = renderWithProviders(<QuickAdd onCreated={onCreated} />)
    const input = screen.getByLabelText('Quick add task')

    await user.type(input, 'Pay rent tomorrow !high #finance @Home')
    const preview = await screen.findByTestId('quick-add-preview')
    expect(preview).toHaveTextContent('Pay rent')
    expect(preview).toHaveTextContent('@Home')
    expect(preview).toHaveTextContent('High')
    expect(preview).toHaveTextContent('Tomorrow')
    expect(preview).toHaveTextContent('#finance')

    await user.keyboard('{Enter}')
    await waitFor(() => expect(db.tasks).toHaveLength(1))
    expect(db.tasks[0]!.title).toBe('Pay rent')
    expect(db.tasks[0]!.priority).toBe('high')
    expect(input).toHaveValue('')
    expect(screen.queryByTestId('quick-add-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Added "Pay rent"')

    // the toast offers to open the new task
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(onCreated).toHaveBeenCalledWith(db.tasks[0]!.id)
  })

  it('shows warnings for unknown projects', async () => {
    const { user } = renderWithProviders(<QuickAdd />)
    await user.type(screen.getByLabelText('Quick add task'), 'Thing @Nowhere')
    expect(await screen.findByText(/Project 'Nowhere' not found/)).toBeInTheDocument()
  })

  it('ignores empty submissions', async () => {
    const { user } = renderWithProviders(<QuickAdd />)
    await user.type(screen.getByLabelText('Quick add task'), '   {Enter}')
    expect(db.tasks).toHaveLength(0)
  })
})

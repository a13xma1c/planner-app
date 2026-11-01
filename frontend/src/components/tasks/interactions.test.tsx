/** Optimistic completion, undo-delete, due-date shortcuts, board quick-add, keyboard navigation, title badge. */
import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { db, seedTask, todayISO } from '@/test/fakeApi'
import { server } from '@/test/server'
import { renderApp, renderWithProviders } from '@/test/utils'

import { Board } from '../board/Board'
import { TaskDetailPanel } from './TaskDetailPanel'

const shiftDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('optimistic completion', () => {
  it('ticks the checkbox before the server answers', async () => {
    seedTask({ title: 'Slow one' })
    server.use(
      http.post('/api/tasks/:id/complete', async () => {
        await delay(400)
        return HttpResponse.json({ task: { ...db.tasks[0]!, status: 'done' }, next_task: null })
      }),
    )
    const { user } = renderApp('/w/1/tasks?done=1')
    const box = await screen.findByRole('checkbox', { name: 'Complete Slow one' })
    await user.click(box)
    // immediately reflected, while the request is still pending
    expect(screen.getByRole('checkbox', { name: 'Reopen Slow one' })).toBeChecked()
    expect(screen.getByText('Slow one')).toHaveClass('line-through')
  })

  it('rolls back when the server rejects the change', async () => {
    seedTask({ title: 'Locked' })
    server.use(
      http.post('/api/tasks/:id/complete', () =>
        HttpResponse.json({ detail: 'nope' }, { status: 500 }),
      ),
    )
    const { user } = renderApp('/w/1/tasks')
    await user.click(await screen.findByRole('checkbox', { name: 'Complete Locked' }))
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Complete Locked' })).not.toBeChecked(),
    )
    expect(screen.getByRole('status')).toHaveTextContent('Could not complete task')
    expect(db.tasks[0]!.status).toBe('todo')
  })
})

describe('undo delete', () => {
  it('recreates the task from the toast', async () => {
    const task = seedTask({ title: 'Oops', notes: 'keep', tagNames: ['t'], due_date: shiftDays(2) })
    const { user } = renderWithProviders(<TaskDetailPanel taskId={task.id} onClose={() => {}} />)
    await user.click(await screen.findByRole('button', { name: 'Delete task' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this task?' })).getByRole('button', {
        name: 'Delete',
      }),
    )
    await waitFor(() => expect(db.tasks).toHaveLength(0))
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Deleted "Oops"')
    await user.click(within(toast).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(db.tasks).toHaveLength(1))
    expect(db.tasks[0]).toMatchObject({ title: 'Oops', notes: 'keep', due_date: shiftDays(2) })
    expect(db.tasks[0]!.tags.map((t) => t.name)).toEqual(['t'])
    expect(await screen.findByText('Restored "Oops"')).toBeInTheDocument()
  })
})

describe('due date shortcuts', () => {
  it('sets today / tomorrow / next week from the panel', async () => {
    const task = seedTask({ title: 'When' })
    const { user } = renderWithProviders(<TaskDetailPanel taskId={task.id} onClose={() => {}} />)
    await screen.findByLabelText('Task title')
    await user.click(screen.getByRole('button', { name: 'Tomorrow' }))
    await waitFor(() => expect(db.tasks[0]!.due_date).toBe(shiftDays(1)))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tomorrow' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() => expect(db.tasks[0]!.due_date).toBe(shiftDays(7)))
    await user.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(db.tasks[0]!.due_date).toBe(todayISO()))
    await user.click(screen.getByRole('button', { name: 'Clear due date' }))
    await waitFor(() => expect(db.tasks[0]!.due_date).toBeNull())
  })
})

describe('board column quick add', () => {
  it('creates a task directly in the column', async () => {
    const { user } = renderWithProviders(<Board tasks={[]} onOpen={() => {}} />)
    await user.click(screen.getByTestId('add-to-in_progress'))
    const input = screen.getByLabelText('New task in In progress')
    expect(input).toHaveFocus()
    await user.type(input, 'Started already{Enter}')
    await waitFor(() => expect(db.tasks).toHaveLength(1))
    expect(db.tasks[0]).toMatchObject({ title: 'Started already', status: 'in_progress' })
    expect(input).toHaveValue('')
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('New task in In progress')).not.toBeInTheDocument()
  })

  it('is hidden for viewers', () => {
    renderWithProviders(<Board tasks={[]} onOpen={() => {}} />, { workspace: { role: 'viewer' } })
    expect(screen.queryByTestId('add-to-todo')).not.toBeInTheDocument()
  })
})

describe('keyboard navigation', () => {
  it('moves with j/k, opens with Enter, selects with x and completes with c', async () => {
    seedTask({ title: 'First' })
    seedTask({ title: 'Second' })
    const { user, router } = renderApp('/w/1/tasks')
    await screen.findByText('Second')
    const row = (title: string) => screen.getByText(title).closest('[data-task-id]')!

    await user.keyboard('j')
    expect(row('First')).toHaveAttribute('data-focused', 'true')
    await user.keyboard('j')
    expect(row('Second')).toHaveAttribute('data-focused', 'true')
    await user.keyboard('j') // clamps at the end
    expect(row('Second')).toHaveAttribute('data-focused', 'true')
    await user.keyboard('k')
    expect(row('First')).toHaveAttribute('data-focused', 'true')

    await user.keyboard('x')
    expect(await screen.findByTestId('bulk-bar')).toHaveTextContent('1 selected')
    await user.keyboard('x')
    await waitFor(() => expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument())

    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.search).toMatch(/task=\d+/))
    expect(await screen.findByLabelText('Task title')).toHaveValue('First')
    await user.keyboard('{Escape}') // closes the panel

    await user.keyboard('c')
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'First')?.status).toBe('done'))
  })

  it('ignores keys while typing in inputs', async () => {
    seedTask({ title: 'Only' })
    const { user } = renderApp('/w/1/tasks')
    await screen.findByText('Only')
    await user.click(screen.getByTestId('search-input'))
    await user.keyboard('j')
    expect(screen.getByTestId('search-input')).toHaveValue('j')
    expect(screen.getByText('Only').closest('[data-task-id]')).not.toHaveAttribute('data-focused')
  })
})

describe('document title', () => {
  it('shows the number of tasks needing attention today', async () => {
    seedTask({ title: 'Late', due_date: shiftDays(-1) })
    seedTask({ title: 'Now', due_date: todayISO() })
    seedTask({ title: 'Later', due_date: shiftDays(3) })
    renderApp('/w/1')
    await waitFor(() => expect(document.title).toBe("(2) Me's planner · Planner"))
  })
})

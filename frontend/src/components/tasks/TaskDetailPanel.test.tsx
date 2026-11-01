import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { db, seedProject, seedTask } from '@/test/fakeApi'
import { makeSubtask } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { TaskDetailPanel } from './TaskDetailPanel'

describe('TaskDetailPanel', () => {
  it('renders nothing when no task is selected', () => {
    renderWithProviders(<TaskDetailPanel taskId={null} onClose={() => {}} />)
    expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument()
  })

  it('shows an error for a missing task', async () => {
    renderWithProviders(<TaskDetailPanel taskId={999} onClose={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Task 999 not found')
  })

  async function openPanel(extra: Parameters<typeof seedTask>[0] = {}) {
    const task = seedTask({ title: 'Draft', notes: 'n', ...extra })
    const onClose = vi.fn()
    const utils = renderWithProviders(<TaskDetailPanel taskId={task.id} onClose={onClose} />)
    const title = await screen.findByLabelText('Task title')
    return { ...utils, task, onClose, title, panel: screen.getByTestId('task-panel') }
  }

  it('edits the title, selects and notes', async () => {
    const project = seedProject({ name: 'Work' })
    const { user, panel, title } = await openPanel()

    await user.clear(title)
    await user.type(title, 'Draft v2{Enter}')
    await waitFor(() => expect(db.tasks[0]!.title).toBe('Draft v2'))

    await user.selectOptions(within(panel).getByLabelText('Priority'), 'urgent')
    await waitFor(() => expect(db.tasks[0]!.priority).toBe('urgent'))
    await user.selectOptions(within(panel).getByLabelText('Project'), String(project.id))
    await waitFor(() => expect(db.tasks[0]!.project_id).toBe(project.id))
    await user.selectOptions(within(panel).getByLabelText('Repeat'), 'weekly')
    await waitFor(() => expect(db.tasks[0]!.recurrence).toBe('weekly'))

    const notes = within(panel).getByLabelText('Notes')
    await user.clear(notes)
    await user.type(notes, 'updated notes')
    await user.tab()
    await waitFor(() => expect(db.tasks[0]!.notes).toBe('updated notes'))
  })

  it('manages subtasks', async () => {
    const { user, panel, task } = await openPanel()
    db.tasks[0]!.subtasks = [makeSubtask(task.id, { title: 'step one' })]
    await user.type(within(panel).getByLabelText('New subtask'), 'step two{Enter}')
    await waitFor(() => expect(db.tasks[0]!.subtasks).toHaveLength(2))
    expect(await within(panel).findByLabelText('Subtask step two')).toBeInTheDocument()

    await user.click(within(panel).getByRole('checkbox', { name: 'Check step one' }))
    await waitFor(() => expect(db.tasks[0]!.subtasks[0]!.is_done).toBe(true))

    await user.click(within(panel).getByRole('button', { name: 'Delete subtask step two' }))
    await waitFor(() => expect(db.tasks[0]!.subtasks).toHaveLength(1))
  })

  it('edits tags, completes, and closes on Escape', async () => {
    const { user, panel, onClose } = await openPanel({ tagNames: ['a'] })
    await user.type(within(panel).getByLabelText('Tags'), 'b{Enter}')
    await waitFor(() => expect(db.tasks[0]!.tags.map((t) => t.name)).toEqual(['a', 'b']))
    await user.click(await within(panel).findByRole('button', { name: 'Remove tag a' }))
    await waitFor(() => expect(db.tasks[0]!.tags.map((t) => t.name)).toEqual(['b']))

    await user.click(within(panel).getByTestId('panel-toggle-done'))
    await waitFor(() => expect(db.tasks[0]!.status).toBe('done'))
    expect(await within(panel).findByRole('button', { name: /Reopen/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes the task after confirmation', async () => {
    const task = seedTask({ title: 'Bye' })
    const onClose = vi.fn()
    const { user } = renderWithProviders(<TaskDetailPanel taskId={task.id} onClose={onClose} />)
    await user.click(await screen.findByRole('button', { name: 'Delete task' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this task?' })).getByRole('button', {
        name: 'Delete',
      }),
    )
    await waitFor(() => expect(db.tasks).toHaveLength(0))
    expect(onClose).toHaveBeenCalled()
  })

  it('duplicates the task', async () => {
    const task = seedTask({ title: 'Orig', tagNames: ['x'] })
    const { user } = renderWithProviders(<TaskDetailPanel taskId={task.id} onClose={() => {}} />)
    await user.click(await screen.findByRole('button', { name: 'Duplicate task' }))
    await waitFor(() => expect(db.tasks).toHaveLength(2))
    expect(db.tasks[1]!.title).toBe('Orig (copy)')
    expect(db.tasks[1]!.tags[0]!.name).toBe('x')
  })
})

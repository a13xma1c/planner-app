import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { db, seedProject } from '@/test/fakeApi'
import { renderWithProviders } from '@/test/utils'

import { TaskFormDialog } from './TaskFormDialog'

describe('TaskFormDialog', () => {
  it('creates a task with all fields', async () => {
    const project = seedProject({ name: 'Home' })
    const onCreated = vi.fn()
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <TaskFormDialog open onClose={onClose} onCreated={onCreated} />,
    )

    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled()
    await user.type(screen.getByLabelText('Title'), '  Paint fence ')
    await user.selectOptions(await screen.findByLabelText('Project'), String(project.id))
    await user.selectOptions(screen.getByLabelText('Priority'), 'low')
    await user.type(screen.getByLabelText('Due date'), '2030-01-02')
    await user.selectOptions(screen.getByLabelText('Repeat'), 'yearly')
    await user.type(screen.getByLabelText('Estimate (minutes)'), '45')
    await user.type(screen.getByLabelText('Tags'), 'outdoor,')
    await user.type(screen.getByLabelText('Notes'), 'white')
    await user.type(screen.getByLabelText('Checklist'), 'buy paint{Enter}  {Enter}sand')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(db.tasks).toHaveLength(1))
    const t = db.tasks[0]!
    expect(t).toMatchObject({
      title: 'Paint fence',
      project_id: project.id,
      priority: 'low',
      due_date: '2030-01-02',
      recurrence: 'yearly',
      estimate_minutes: 45,
      notes: 'white',
    })
    expect(t.tags.map((x) => x.name)).toEqual(['outdoor'])
    expect(t.subtasks.map((s) => s.title)).toEqual(['buy paint', 'sand'])
    expect(onCreated).toHaveBeenCalledWith(t.id)
    expect(onClose).toHaveBeenCalled()
  })

  it('cancel closes without creating', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(<TaskFormDialog open onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(db.tasks).toHaveLength(0)
  })
})

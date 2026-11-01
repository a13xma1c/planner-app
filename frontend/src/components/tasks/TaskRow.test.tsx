import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { makeProject, makeSubtask, makeTag, makeTask } from '@/test/fixtures'

import { TaskRow } from './TaskRow'

describe('TaskRow', () => {
  it('renders the task with its metadata', () => {
    const project = makeProject({ name: 'Work', color: '#0ea5e9' })
    const task = makeTask({
      id: 1,
      title: 'Ship it',
      notes: 'has notes',
      project,
      project_id: project.id,
      priority: 'urgent',
      status: 'in_progress',
      estimate_minutes: 90,
      tags: [makeTag({ name: 'release' })],
      subtasks: [makeSubtask(1, { is_done: true }), makeSubtask(1)],
    })
    render(
      <ul>
        <TaskRow task={task} onOpen={() => {}} onToggleDone={() => {}} />
      </ul>,
    )
    expect(screen.getByText('Ship it')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('P1')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('1h 30m')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('#release')).toBeInTheDocument()
    expect(screen.getByLabelText('Has notes')).toBeInTheDocument()
  })

  it('calls callbacks for open, complete and select', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onToggleDone = vi.fn()
    const onToggleSelect = vi.fn()
    const task = makeTask({ id: 7, title: 'Click me' })
    render(
      <ul>
        <TaskRow
          task={task}
          onOpen={onOpen}
          onToggleDone={onToggleDone}
          onToggleSelect={onToggleSelect}
        />
      </ul>,
    )
    await user.click(screen.getByRole('button', { name: 'Open Click me' }))
    expect(onOpen).toHaveBeenCalledWith(7)
    await user.click(screen.getByRole('checkbox', { name: 'Complete Click me' }))
    expect(onToggleDone).toHaveBeenCalledWith(task)
    await user.click(screen.getByRole('checkbox', { name: 'Select Click me' }))
    expect(onToggleSelect).toHaveBeenCalledWith(7)
  })

  it('shows done tasks struck through with a reopen control', () => {
    render(
      <ul>
        <TaskRow
          task={makeTask({ title: 'Done thing', status: 'done' })}
          onOpen={() => {}}
          onToggleDone={() => {}}
        />
      </ul>,
    )
    expect(screen.getByText('Done thing')).toHaveClass('line-through')
    expect(screen.getByRole('checkbox', { name: 'Reopen Done thing' })).toBeChecked()
  })
})

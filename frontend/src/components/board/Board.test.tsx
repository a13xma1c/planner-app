import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeTask } from '@/test/fixtures'
import { renderWithoutRouter } from '@/test/utils'

import { Board } from './Board'

describe('Board', () => {
  it('places tasks in status columns ordered by position', () => {
    const tasks = [
      makeTask({ id: 1, title: 'second todo', status: 'todo', position: 2 }),
      makeTask({ id: 2, title: 'first todo', status: 'todo', position: 1 }),
      makeTask({ id: 3, title: 'working', status: 'in_progress' }),
      makeTask({ id: 4, title: 'finished', status: 'done' }),
    ]
    renderWithoutRouter(<Board tasks={tasks} onOpen={() => {}} />)
    const todo = screen.getByTestId('column-todo')
    const cards = within(todo).getAllByTestId('board-card')
    expect(cards.map((c) => c.getAttribute('data-task-id'))).toEqual(['2', '1'])
    expect(within(todo).getByText('2')).toBeInTheDocument() // count badge
    expect(
      within(screen.getByTestId('column-in_progress')).getByText('working'),
    ).toBeInTheDocument()
    expect(within(screen.getByTestId('column-done')).getByText('finished')).toHaveClass(
      'line-through',
    )
  })

  it('shows a drop hint for empty columns and opens tasks on click', async () => {
    const onOpen = vi.fn()
    const { user } = renderWithoutRouter(
      <Board tasks={[makeTask({ id: 9, title: 'only' })]} onOpen={onOpen} />,
    )
    expect(screen.getAllByText('Drop tasks here')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Open only' }))
    expect(onOpen).toHaveBeenCalledWith(9)
    expect(screen.getByRole('button', { name: 'Drag only' })).toBeInTheDocument()
  })

  it('re-syncs columns when the task list changes', () => {
    const { rerender } = renderWithoutRouter(
      <Board tasks={[makeTask({ id: 1, title: 'a' })]} onOpen={() => {}} />,
    )
    expect(within(screen.getByTestId('column-todo')).getAllByTestId('board-card')).toHaveLength(1)
    rerender(
      <Board
        tasks={[makeTask({ id: 1, title: 'a', status: 'done' }), makeTask({ id: 2, title: 'b' })]}
        onOpen={() => {}}
      />,
    )
    expect(within(screen.getByTestId('column-done')).getByText('a')).toBeInTheDocument()
    expect(within(screen.getByTestId('column-todo')).getByText('b')).toBeInTheDocument()
  })
})

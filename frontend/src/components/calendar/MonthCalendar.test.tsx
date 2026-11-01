import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeTask } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { MonthCalendar } from './MonthCalendar'

const march = new Date(2025, 2, 1)

describe('MonthCalendar', () => {
  it('renders the month grid with tasks in their day cells', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Dentist', due_date: '2025-03-14' }),
      makeTask({ id: 2, title: 'Done thing', due_date: '2025-03-14', status: 'done' }),
      makeTask({ id: 3, title: 'Leap', due_date: '2025-02-28' }), // leading day from Feb is visible
      ...Array.from({ length: 5 }, (_, i) =>
        makeTask({ id: 10 + i, title: `busy ${i}`, due_date: '2025-03-20' }),
      ),
    ]
    renderWithProviders(
      <MonthCalendar
        month={march}
        onMonthChange={() => {}}
        tasks={tasks}
        onOpen={() => {}}
        onReschedule={() => {}}
      />,
    )
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('March 2025')
    const cell = screen.getByTestId('day-2025-03-14')
    expect(within(cell).getByText('Dentist')).toBeInTheDocument()
    expect(within(cell).getByText('Done thing').closest('button')).toHaveClass('line-through')
    expect(within(screen.getByTestId('day-2025-02-28')).getByText('Leap')).toBeInTheDocument()
    expect(within(screen.getByTestId('day-2025-03-20')).getByText('+2 more')).toBeInTheDocument()
    // 6 weeks x 7 days are always rendered
    expect(screen.getAllByTestId(/^day-/)).toHaveLength(42)
  })

  it('navigates months and opens tasks / days', async () => {
    const onMonthChange = vi.fn()
    const onOpen = vi.fn()
    const onDayClick = vi.fn()
    const { user } = renderWithProviders(
      <MonthCalendar
        month={march}
        onMonthChange={onMonthChange}
        tasks={[makeTask({ id: 1, title: 'Dentist', due_date: '2025-03-14' })]}
        onOpen={onOpen}
        onReschedule={() => {}}
        onDayClick={onDayClick}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange.mock.calls[0]![0].getMonth()).toBe(3)
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onMonthChange.mock.calls[1]![0].getMonth()).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(onMonthChange).toHaveBeenCalledTimes(3)

    await user.click(screen.getByRole('button', { name: 'Dentist' }))
    expect(onOpen).toHaveBeenCalledWith(1)
    await user.click(screen.getByRole('button', { name: /^14 March 2025/ }))
    expect(onDayClick).toHaveBeenCalledWith('2025-03-14')
  })
})

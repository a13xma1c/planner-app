import { startOfMonth } from 'date-fns'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useTasks } from '@/api/queries'
import { MonthCalendar } from '@/components/calendar/MonthCalendar'
import { useTaskActions } from '@/components/tasks/useTaskActions'
import { ErrorState, PageHeader } from '@/components/ui/Misc'
import { calendarRange, parseDate, toISODate } from '@/lib/dates'
import { useTaskPanel } from '@/lib/taskPanel'
import { useWorkspace } from '@/lib/workspaceContext'

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [month, setMonth] = useState<Date>(() => {
    const fromUrl = parseDate(params.get('month') ? `${params.get('month')}-01` : null)
    return startOfMonth(fromUrl ?? new Date())
  })
  const { start, end } = useMemo(() => calendarRange(month), [month])
  const {
    data: tasks = [],
    error,
    refetch,
  } = useTasks({
    due_from: toISODate(start),
    due_to: toISODate(end),
    sort: 'priority',
    limit: 1000,
  })
  const { open } = useTaskPanel()
  const { patch } = useTaskActions()
  const { path } = useWorkspace()

  const changeMonth = (d: Date) => {
    setMonth(d)
    setParams(
      (prev) => {
        prev.set('month', toISODate(d).slice(0, 7))
        return prev
      },
      { replace: true },
    )
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Drag a task onto another day to reschedule it. Click a day to see everything due."
      />
      {error && <ErrorState error={error} retry={() => refetch()} />}
      <MonthCalendar
        month={month}
        onMonthChange={changeMonth}
        tasks={tasks}
        onOpen={open}
        onReschedule={(id, due) => patch(id, { due_date: due })}
        onDayClick={(iso) => navigate(path(`/tasks?due=${iso}`))}
      />
    </div>
  )
}

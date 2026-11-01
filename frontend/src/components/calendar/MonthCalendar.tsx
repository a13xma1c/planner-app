import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Task } from '@/api/types'
import { calendarRange, toISODate } from '@/lib/dates'
import { PRIORITY_META } from '@/lib/meta'
import { cn, groupBy } from '@/lib/utils'

import { Button } from '../ui/Button'

interface MonthCalendarProps {
  month: Date
  onMonthChange: (d: Date) => void
  tasks: Task[]
  onOpen: (id: number) => void
  onReschedule: (taskId: number, dueDate: string) => void
  onDayClick?: (iso: string) => void
}

export function MonthCalendar({
  month,
  onMonthChange,
  tasks,
  onOpen,
  onReschedule,
  onDayClick,
}: MonthCalendarProps) {
  const [now] = useState(() => new Date())
  const { start, end } = calendarRange(month)
  const days = useMemo(() => eachDayOfInterval({ start, end }), [start, end])
  const byDay = useMemo(
    () =>
      groupBy(
        tasks.filter((t) => t.due_date),
        (t) => t.due_date!,
      ),
    [tasks],
  )
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const task = tasks.find((t) => t.id === Number(active.id))
    const iso = String(over.id)
    if (task && task.due_date !== iso) onReschedule(task.id, iso)
  }

  return (
    <div data-testid="calendar">
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="text-lg font-semibold text-slate-900 dark:text-white"
          data-testid="calendar-month"
        >
          {format(month, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(addMonths(month, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(addMonths(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-x border-b border-slate-200 dark:border-slate-700">
          {days.map((day) => (
            <DayCell
              key={day.toISOString()}
              day={day}
              inMonth={isSameMonth(day, month)}
              tasks={byDay.get(toISODate(day)) ?? []}
              onOpen={onOpen}
              onDayClick={onDayClick}
              now={now}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}

function DayCell({
  day,
  inMonth,
  tasks,
  onOpen,
  onDayClick,
  now,
}: {
  day: Date
  inMonth: boolean
  tasks: Task[]
  onOpen: (id: number) => void
  onDayClick?: (iso: string) => void
  now: Date
}) {
  const iso = toISODate(day)
  const { setNodeRef, isOver } = useDroppable({ id: iso })
  const open = tasks.filter((t) => t.status !== 'done')
  const shown = tasks.slice(0, 3)
  const today = isSameDay(day, now)
  return (
    <div
      ref={setNodeRef}
      data-testid={`day-${iso}`}
      className={cn(
        'min-h-[96px] border-b border-r border-slate-100 p-1 dark:border-slate-800',
        !inMonth && 'bg-slate-50/60 dark:bg-slate-900/40',
        isOver && 'bg-indigo-50 dark:bg-indigo-500/10',
      )}
    >
      <button
        type="button"
        onClick={() => onDayClick?.(iso)}
        className={cn(
          'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs',
          today
            ? 'bg-indigo-600 font-semibold text-white'
            : inMonth
              ? 'text-slate-700 dark:text-slate-200'
              : 'text-slate-400',
          'hover:bg-slate-200 dark:hover:bg-slate-700',
          today && 'hover:bg-indigo-500',
        )}
        aria-label={`${format(day, 'd MMMM yyyy')}${open.length ? `, ${open.length} open` : ''}`}
      >
        {format(day, 'd')}
      </button>
      <ul className="space-y-0.5">
        {shown.map((t) => (
          <CalendarChip key={t.id} task={t} onOpen={onOpen} />
        ))}
        {tasks.length > shown.length && (
          <li>
            <button
              type="button"
              onClick={() => onDayClick?.(iso)}
              className="px-1 text-[10px] text-slate-500 hover:underline"
            >
              +{tasks.length - shown.length} more
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

function CalendarChip({ task, onOpen }: { task: Task; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const done = task.status === 'done'
  return (
    <li
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn('relative', isDragging && 'z-20 opacity-80')}
    >
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className={cn(
          'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-4',
          'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-indigo-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
          done && 'text-slate-400 line-through',
        )}
        title={task.title}
        {...attributes}
        {...listeners}
      >
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_META[task.priority].dot)}
          style={{ backgroundColor: task.project?.color }}
        />
        <span className="truncate">{task.title}</span>
      </button>
    </li>
  )
}

import { CheckSquare, GripVertical, MessageSquare, MessageSquareText } from 'lucide-react'
import { memo } from 'react'

import type { Task } from '@/api/types'
import { cn } from '@/lib/utils'

import { Checkbox } from '../ui/Checkbox'
import { AssigneeChip } from '../workspace/Avatar'
import { DueBadge, EstimateBadge, PriorityBadge, ProjectDot, StatusBadge, TagChip } from './badges'

interface TaskRowProps {
  task: Task
  onOpen: (id: number) => void
  onToggleDone: (task: Task) => void
  selected?: boolean
  onToggleSelect?: (id: number) => void
  showProject?: boolean
  dragHandle?: boolean
  /** When false, completion/selection controls are disabled (viewer role). */
  canEdit?: boolean
  /** Keyboard cursor highlight. */
  focused?: boolean
  onHover?: (id: number) => void
}

export const TaskRow = memo(function TaskRow({
  task,
  onOpen,
  onToggleDone,
  selected = false,
  onToggleSelect,
  showProject = true,
  dragHandle = false,
  canEdit = true,
  focused = false,
  onHover,
}: TaskRowProps) {
  const done = task.status === 'done'
  const subDone = task.subtasks.filter((s) => s.is_done).length

  return (
    <li
      data-testid="task-row"
      data-task-id={task.id}
      data-focused={focused || undefined}
      className={cn(
        'group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors',
        'hover:bg-slate-50 dark:hover:bg-slate-800/60',
        selected &&
          'border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10',
        focused && 'ring-2 ring-inset ring-indigo-400',
      )}
    >
      {dragHandle && <GripVertical className="mt-1 h-4 w-4 text-slate-300" aria-hidden />}
      {onToggleSelect && canEdit && (
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(task.id)}
          label={`Select ${task.title}`}
          className={cn(
            'mt-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            selected && 'opacity-100',
          )}
        />
      )}
      <Checkbox
        round
        checked={done}
        onChange={() => onToggleDone(task)}
        label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className="mt-0.5"
        disabled={!canEdit}
      />
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        onMouseEnter={onHover ? () => onHover(task.id) : undefined}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
        aria-label={`Open ${task.title}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-sm font-medium text-slate-900 dark:text-slate-100',
              done && 'text-slate-400 line-through dark:text-slate-500',
            )}
          >
            {task.title}
          </span>
          {task.notes && (
            <MessageSquareText
              className="h-3.5 w-3.5 shrink-0 text-slate-400"
              aria-label="Has notes"
            />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {showProject && <ProjectDot project={task.project} />}
          {task.status === 'in_progress' && <StatusBadge status={task.status} />}
          <DueBadge due={task.due_date} done={done} recurrence={task.recurrence} />
          {task.priority !== 'medium' && <PriorityBadge priority={task.priority} compact />}
          <EstimateBadge minutes={task.estimate_minutes} />
          {task.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <CheckSquare className="h-3 w-3" />
              {subDone}/{task.subtasks.length}
            </span>
          )}
          {task.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          {task.comment_count > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-slate-500"
              aria-label={`${task.comment_count} comments`}
            >
              <MessageSquare className="h-3 w-3" />
              {task.comment_count}
            </span>
          )}
          <AssigneeChip user={task.assignee} />
        </div>
      </button>
    </li>
  )
})

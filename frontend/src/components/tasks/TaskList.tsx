import { ClipboardList } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Task } from '@/api/types'

import { EmptyState } from '../ui/Misc'
import { TaskRow } from './TaskRow'

interface TaskListProps {
  tasks: Task[]
  onOpen: (id: number) => void
  onToggleDone: (task: Task) => void
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  showProject?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  /** Optional grouping: returns a key + heading for each task. */
  groupBy?: (task: Task) => { key: string; heading: string }
}

export function TaskList({
  tasks,
  onOpen,
  onToggleDone,
  selectedIds,
  onToggleSelect,
  showProject = true,
  emptyTitle = 'No tasks here',
  emptyDescription = 'Add one with the quick-add bar above.',
  emptyAction,
  groupBy,
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  if (!groupBy) {
    return (
      <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Tasks">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onOpen={onOpen}
            onToggleDone={onToggleDone}
            selected={selectedIds?.has(t.id)}
            onToggleSelect={onToggleSelect}
            showProject={showProject}
          />
        ))}
      </ul>
    )
  }

  const groups = new Map<string, { heading: string; tasks: Task[] }>()
  for (const t of tasks) {
    const { key, heading } = groupBy(t)
    const g = groups.get(key)
    if (g) g.tasks.push(t)
    else groups.set(key, { heading, tasks: [t] })
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([key, g]) => (
        <section key={key} aria-label={g.heading}>
          <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {g.heading} <span className="ml-1 font-normal text-slate-400">{g.tasks.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {g.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onOpen={onOpen}
                onToggleDone={onToggleDone}
                selected={selectedIds?.has(t.id)}
                onToggleSelect={onToggleSelect}
                showProject={showProject}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

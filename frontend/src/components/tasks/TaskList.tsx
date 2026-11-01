import { ClipboardList } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Task } from '@/api/types'

import { useListNavigation } from '@/lib/useListNavigation'
import { useWorkspace } from '@/lib/workspaceContext'

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
  /** j/k/Enter/x/c keyboard navigation (on for page-level lists, off for dashboard cards). */
  keyboard?: boolean
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
  keyboard = false,
}: TaskListProps) {
  const { canEdit } = useWorkspace()
  const { cursor, setCursor } = useListNavigation({
    tasks,
    onOpen,
    onToggleDone: canEdit ? onToggleDone : undefined,
    onToggleSelect: canEdit ? onToggleSelect : undefined,
    enabled: keyboard,
  })
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
            canEdit={canEdit}
            focused={cursor === t.id}
            onHover={keyboard ? setCursor : undefined}
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
                canEdit={canEdit}
                focused={cursor === t.id}
                onHover={keyboard ? setCursor : undefined}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

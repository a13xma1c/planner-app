import { useCallback } from 'react'

import {
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useReopenTask,
  useUpdateTask,
} from '@/api/queries'
import type { Task, TaskCreate, TaskUpdate } from '@/api/types'
import { describeDue } from '@/lib/dates'

import { useToast } from '../ui/toastContext'

/** Everything needed to recreate a task after an accidental delete (comments are not kept). */
export function taskToCreate(task: Task): TaskCreate {
  return {
    title: task.title,
    notes: task.notes,
    project_id: task.project_id,
    priority: task.priority,
    status: task.status,
    due_date: task.due_date,
    recurrence: task.recurrence,
    estimate_minutes: task.estimate_minutes,
    assignee_id: task.assignee_id,
    tags: task.tags.map((t) => t.name),
    subtasks: task.subtasks.map((s) => s.title),
  }
}

/** Complete / reopen / delete / patch with user feedback, shared by list, board and detail. */
export function useTaskActions() {
  const toast = useToast()
  const complete = useCompleteTask({
    onSuccess: ({ task, next_task }) => {
      if (next_task) {
        const due = describeDue(next_task.due_date)
        toast.success(
          `Completed "${task.title}"`,
          `Next occurrence: ${due.label || next_task.due_date}`,
        )
      }
    },
    onError: (e) => toast.error('Could not complete task', e.message),
  })
  const reopen = useReopenTask({ onError: (e) => toast.error('Could not reopen task', e.message) })
  const update = useUpdateTask({ onError: (e) => toast.error('Could not update task', e.message) })
  const recreate = useCreateTask({
    onSuccess: (task) => toast.success(`Restored "${task.title}"`),
    onError: (e) => toast.error('Could not restore task', e.message),
  })
  const remove = useDeleteTask({
    onError: (e) => toast.error('Could not delete task', e.message),
  })

  const toggleDone = useCallback(
    (task: Task) => {
      if (task.status === 'done') reopen.mutate(task.id)
      else complete.mutate(task.id)
    },
    [complete, reopen],
  )

  const patch = useCallback((id: number, data: TaskUpdate) => update.mutate({ id, data }), [update])

  /** Delete with an "Undo" toast that recreates the task (new id; comments are not restored). */
  const removeWithUndo = useCallback(
    async (task: Task) => {
      await remove.mutateAsync(task.id)
      toast.toast({
        kind: 'success',
        title: `Deleted "${task.title}"`,
        duration: 8000,
        action: { label: 'Undo', onClick: () => recreate.mutate(taskToCreate(task)) },
      })
    },
    [remove, recreate, toast],
  )

  return {
    toggleDone,
    patch,
    patchAsync: update.mutateAsync,
    remove: remove.mutate,
    removeAsync: remove.mutateAsync,
    removeWithUndo,
    isPending: complete.isPending || reopen.isPending || update.isPending || remove.isPending,
  }
}

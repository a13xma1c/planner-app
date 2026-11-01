import { useCallback } from 'react'

import { useCompleteTask, useDeleteTask, useReopenTask, useUpdateTask } from '@/api/queries'
import type { Task, TaskUpdate } from '@/api/types'
import { describeDue } from '@/lib/dates'

import { useToast } from '../ui/toastContext'

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
  const remove = useDeleteTask({
    onSuccess: () => toast.success('Task deleted'),
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

  return {
    toggleDone,
    patch,
    patchAsync: update.mutateAsync,
    remove: remove.mutate,
    removeAsync: remove.mutateAsync,
    isPending: complete.isPending || reopen.isPending || update.isPending || remove.isPending,
  }
}

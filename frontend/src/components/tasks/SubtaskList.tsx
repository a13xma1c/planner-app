import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useAddSubtask, useDeleteSubtask, useUpdateSubtask } from '@/api/queries'
import type { Subtask } from '@/api/types'
import { cn } from '@/lib/utils'

import { Checkbox } from '../ui/Checkbox'
import { ProgressBar } from '../ui/Misc'
import { useToast } from '../ui/toastContext'

export function SubtaskList({ taskId, subtasks }: { taskId: number; subtasks: Subtask[] }) {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const onError = (e: Error) => toast.error('Subtask update failed', e.message)
  const add = useAddSubtask({ onError, onSuccess: () => setDraft('') })
  const update = useUpdateSubtask({ onError })
  const remove = useDeleteSubtask({ onError })
  const done = subtasks.filter((s) => s.is_done).length

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist</h3>
        {subtasks.length > 0 && (
          <span className="text-xs text-slate-500">
            {done}/{subtasks.length}
          </span>
        )}
      </div>
      {subtasks.length > 0 && <ProgressBar value={done / subtasks.length} className="mb-2" />}
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li
            key={s.id}
            className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Checkbox
              checked={s.is_done}
              onChange={(checked) => update.mutate({ id: s.id, data: { is_done: checked } })}
              label={s.is_done ? `Uncheck ${s.title}` : `Check ${s.title}`}
            />
            <input
              defaultValue={s.title}
              key={`${s.id}-${s.title}`}
              aria-label={`Subtask ${s.title}`}
              onBlur={(e) => {
                const title = e.target.value.trim()
                if (title && title !== s.title) update.mutate({ id: s.id, data: { title } })
                else e.target.value = s.title
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className={cn(
                'flex-1 bg-transparent text-sm text-slate-800 outline-none focus:underline dark:text-slate-100',
                s.is_done && 'text-slate-400 line-through dark:text-slate-500',
              )}
            />
            <button
              type="button"
              aria-label={`Delete subtask ${s.title}`}
              onClick={() => remove.mutate(s.id)}
              className="text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex items-center gap-2 px-1"
        onSubmit={(e) => {
          e.preventDefault()
          const title = draft.trim()
          if (title) add.mutate({ taskId, title })
        }}
      >
        <Plus className="h-4 w-4 text-slate-400" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add checklist item"
          aria-label="New subtask"
          className="flex-1 bg-transparent py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          disabled={add.isPending}
        />
      </form>
    </div>
  )
}

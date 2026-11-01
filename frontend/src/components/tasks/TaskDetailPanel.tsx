import { Check, Copy, ExternalLink, RotateCcw, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'

import { useCreateTask, useProjects, useTask } from '@/api/queries'
import {
  PRIORITIES,
  RECURRENCES,
  STATUSES,
  type Priority,
  type Recurrence,
  type Status,
  type Task,
} from '@/api/types'
import { addDaysISO, formatDateTime, formatLongDate, todayISO } from '@/lib/dates'
import { PRIORITY_META, RECURRENCE_META, STATUS_META } from '@/lib/meta'
import { useHotkeys } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspaceContext'

import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { ErrorState, PageLoader } from '../ui/Misc'
import { useToast } from '../ui/toastContext'
import { Avatar } from '../workspace/Avatar'
import { DueBadge } from './badges'
import { Comments } from './Comments'
import { SubtaskList } from './SubtaskList'
import { TagInput } from './TagInput'
import { useTaskActions } from './useTaskActions'

interface TaskDetailPanelProps {
  taskId: number | null
  onClose: () => void
}

/** Slide-over panel for viewing/editing a single task. Saves each field on change/blur. */
export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading, error, refetch } = useTask(taskId)
  useHotkeys([{ combo: 'escape', handler: onClose, allowInInput: true }])

  if (taskId === null) return null

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Task details"
        data-testid="task-panel"
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl',
          'dark:border-slate-700 dark:bg-slate-900',
        )}
      >
        {isLoading && <PageLoader />}
        {error && (
          <div className="p-4">
            <ErrorState error={error} retry={() => refetch()} />
            <Button variant="outline" className="mt-3" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
        {task && <TaskEditor key={task.id} task={task} onClose={onClose} />}
      </aside>
    </>
  )
}

function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const toast = useToast()
  const { patch, patchAsync, removeWithUndo, toggleDone } = useTaskActions()
  const { data: projects = [] } = useProjects(false)
  const { path, members, isShared, canEdit } = useWorkspace()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const duplicate = useCreateTask({
    onSuccess: (t) => toast.success(`Duplicated as "${t.title}"`),
    onError: (e) => toast.error('Could not duplicate', e.message),
  })

  // Re-sync local drafts when the server copy changes (React's "adjust state on prop change").
  const [seen, setSeen] = useState({ title: task.title, notes: task.notes })
  if (seen.title !== task.title || seen.notes !== task.notes) {
    setSeen({ title: task.title, notes: task.notes })
    if (seen.title !== task.title) setTitle(task.title)
    if (seen.notes !== task.notes) setNotes(task.notes)
  }

  const saveTitle = () => {
    const t = title.trim()
    if (!t) {
      setTitle(task.title)
      return
    }
    if (t !== task.title) patch(task.id, { title: t })
  }
  const saveNotes = () => {
    if (notes !== task.notes) patch(task.id, { notes })
  }

  const done = task.status === 'done'

  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Button
            variant={done ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => toggleDone(task)}
            data-testid="panel-toggle-done"
            disabled={!canEdit}
          >
            {done ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" /> Complete
              </>
            )}
          </Button>
          <span className="text-xs text-slate-400">#{task.id}</span>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Duplicate task"
              title="Duplicate"
              onClick={() =>
                duplicate.mutate({
                  title: `${task.title} (copy)`,
                  notes: task.notes,
                  project_id: task.project_id,
                  priority: task.priority,
                  due_date: task.due_date,
                  recurrence: task.recurrence,
                  estimate_minutes: task.estimate_minutes,
                  tags: task.tags.map((t) => t.name),
                  subtasks: task.subtasks.map((s) => s.title),
                })
              }
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete task"
              title="Delete"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Close panel" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <fieldset
        disabled={!canEdit}
        className="min-w-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 disabled:opacity-90"
      >
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && titleRef.current?.blur()}
          aria-label="Task title"
          className={cn(
            'w-full bg-transparent text-lg font-semibold text-slate-900 outline-none focus:underline dark:text-white',
            done && 'text-slate-400 line-through',
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="f-status">
            <Select
              id="f-status"
              value={task.status}
              onChange={(e) => patch(task.id, { status: e.target.value as Status })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="f-priority">
            <Select
              id="f-priority"
              value={task.priority}
              onChange={(e) => patch(task.id, { priority: e.target.value as Priority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project" htmlFor="f-project">
            <Select
              id="f-project"
              value={task.project_id ?? ''}
              onChange={(e) =>
                patch(task.id, { project_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">Inbox</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {task.project?.is_archived && (
                <option value={task.project.id}>{task.project.name} (archived)</option>
              )}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="f-due">
            <div className="flex items-center gap-1">
              <Input
                id="f-due"
                type="date"
                className="min-w-0"
                value={task.due_date ?? ''}
                onChange={(e) => patch(task.id, { due_date: e.target.value || null })}
              />
              {task.due_date && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Clear due date"
                  onClick={() => patch(task.id, { due_date: null })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1" aria-label="Due date shortcuts">
              {[
                ['Today', todayISO()],
                ['Tomorrow', addDaysISO(1)],
                ['Next week', addDaysISO(7)],
              ].map(([label, iso]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => patch(task.id, { due_date: iso })}
                  aria-pressed={task.due_date === iso}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    task.due_date === iso
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Repeat" htmlFor="f-recurrence">
            <Select
              id="f-recurrence"
              value={task.recurrence ?? ''}
              onChange={(e) =>
                patch(task.id, { recurrence: (e.target.value || null) as Recurrence | null })
              }
            >
              <option value="">Never</option>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_META[r]}
                </option>
              ))}
            </Select>
          </Field>
          {isShared && (
            <Field label="Assignee" htmlFor="f-assignee">
              <Select
                id="f-assignee"
                value={task.assignee_id ?? ''}
                onChange={(e) =>
                  patch(task.id, { assignee_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Estimate (minutes)" htmlFor="f-estimate">
            <Input
              id="f-estimate"
              type="number"
              min={0}
              step={5}
              defaultValue={task.estimate_minutes ?? ''}
              key={`est-${task.estimate_minutes}`}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                if (v !== task.estimate_minutes) patch(task.id, { estimate_minutes: v })
              }}
            />
          </Field>
        </div>

        {task.due_date && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <DueBadge due={task.due_date} done={done} recurrence={task.recurrence} />
            {formatLongDate(task.due_date)}
          </p>
        )}

        <Field label="Tags" htmlFor="f-tags">
          <TagInput
            id="f-tags"
            value={task.tags.map((t) => t.name)}
            onChange={(tags) => patchAsync({ id: task.id, data: { tags } })}
          />
        </Field>

        <Field label="Notes" htmlFor="f-notes">
          <Textarea
            id="f-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Add details, links, context…"
            rows={5}
          />
        </Field>

        <SubtaskList taskId={task.id} subtasks={task.subtasks} />

        <Comments taskId={task.id} />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
          <dt>Created</dt>
          <dd>{formatDateTime(task.created_at)}</dd>
          <dt>Updated</dt>
          <dd>{formatDateTime(task.updated_at)}</dd>
          {task.completed_at && (
            <>
              <dt>Completed</dt>
              <dd>{formatDateTime(task.completed_at)}</dd>
            </>
          )}
          {task.created_by && (
            <>
              <dt>Created by</dt>
              <dd className="flex items-center gap-1">
                <Avatar user={task.created_by} size="xs" /> {task.created_by.display_name}
              </dd>
            </>
          )}
          {task.project && (
            <>
              <dt>Project</dt>
              <dd>
                <Link
                  to={path(`/projects/${task.project.id}`)}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {task.project.name} <ExternalLink className="h-3 w-3" />
                </Link>
              </dd>
            </>
          )}
        </dl>
      </fieldset>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false)
          await removeWithUndo(task)
          onClose()
        }}
        title="Delete this task?"
        message={
          <>
            <strong>{task.title}</strong> will be permanently deleted.
          </>
        }
        confirmLabel="Delete"
      />
    </>
  )
}

import { useState, type FormEvent } from 'react'

import { useCreateTask, useProjects } from '@/api/queries'
import {
  PRIORITIES,
  RECURRENCES,
  type Priority,
  type Recurrence,
  type TaskCreate,
} from '@/api/types'
import { PRIORITY_META, RECURRENCE_META } from '@/lib/meta'
import { useWorkspace } from '@/lib/workspaceContext'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { useToast } from '../ui/toastContext'
import { TagInput } from './TagInput'

interface TaskFormDialogProps {
  open: boolean
  onClose: () => void
  defaults?: Partial<TaskCreate>
  onCreated?: (id: number) => void
}

/** Full "new task" form (for people who prefer fields over quick-add syntax). */
export function TaskFormDialog({ open, onClose, defaults, onCreated }: TaskFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="New task" size="md">
      {open && <TaskForm onClose={onClose} defaults={defaults} onCreated={onCreated} />}
    </Dialog>
  )
}

function TaskForm({ onClose, defaults, onCreated }: Omit<TaskFormDialogProps, 'open'>) {
  const toast = useToast()
  const { data: projects = [] } = useProjects(false)
  const { members, isShared } = useWorkspace()
  const [form, setForm] = useState<TaskCreate>({
    title: '',
    notes: '',
    project_id: null,
    priority: 'medium',
    due_date: null,
    recurrence: null,
    estimate_minutes: null,
    assignee_id: null,
    tags: [],
    subtasks: [],
    ...defaults,
  })
  const [subtaskText, setSubtaskText] = useState('')
  const create = useCreateTask({
    onSuccess: (task) => {
      toast.success(`Created "${task.title}"`)
      onCreated?.(task.id)
      onClose()
    },
    onError: (e) => toast.error('Could not create task', e.message),
  })

  const set = <K extends keyof TaskCreate>(key: K, value: TaskCreate[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    create.mutate({
      ...form,
      title: form.title.trim(),
      subtasks: subtaskText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="task-form">
      <Field label="Title" htmlFor="t-title">
        <Input
          id="t-title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="What needs doing?"
          required
          maxLength={200}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project" htmlFor="t-project">
          <Select
            id="t-project"
            value={form.project_id ?? ''}
            onChange={(e) => set('project_id', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Inbox</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="t-priority">
          <Select
            id="t-priority"
            value={form.priority}
            onChange={(e) => set('priority', e.target.value as Priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="t-due">
          <Input
            id="t-due"
            type="date"
            value={form.due_date ?? ''}
            onChange={(e) => set('due_date', e.target.value || null)}
          />
        </Field>
        <Field label="Repeat" htmlFor="t-recurrence">
          <Select
            id="t-recurrence"
            value={form.recurrence ?? ''}
            onChange={(e) => set('recurrence', (e.target.value || null) as Recurrence | null)}
          >
            <option value="">Never</option>
            {RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {RECURRENCE_META[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estimate (minutes)" htmlFor="t-estimate">
          <Input
            id="t-estimate"
            type="number"
            min={0}
            step={5}
            value={form.estimate_minutes ?? ''}
            onChange={(e) =>
              set('estimate_minutes', e.target.value === '' ? null : Number(e.target.value))
            }
          />
        </Field>
        <Field label="Tags" htmlFor="t-tags">
          <TagInput id="t-tags" value={form.tags ?? []} onChange={(tags) => set('tags', tags)} />
        </Field>
        {isShared && (
          <Field label="Assignee" htmlFor="t-assignee">
            <Select
              id="t-assignee"
              value={form.assignee_id ?? ''}
              onChange={(e) => set('assignee_id', e.target.value ? Number(e.target.value) : null)}
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
      </div>
      <Field label="Notes" htmlFor="t-notes">
        <Textarea
          id="t-notes"
          value={form.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
        />
      </Field>
      <Field label="Checklist" htmlFor="t-subtasks" hint="One item per line">
        <Textarea
          id="t-subtasks"
          value={subtaskText}
          onChange={(e) => setSubtaskText(e.target.value)}
          rows={3}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!form.title.trim()}>
          Create task
        </Button>
      </div>
    </form>
  )
}

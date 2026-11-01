import { CheckCheck, Tag as TagIcon, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { useBulk, useProjects } from '@/api/queries'
import { PRIORITIES, type BulkRequest, type Priority } from '@/api/types'
import { addDaysISO } from '@/lib/dates'
import { PRIORITY_META } from '@/lib/meta'
import { useWorkspace } from '@/lib/workspaceContext'

import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { Input, Select } from '../ui/Input'
import { useToast } from '../ui/toastContext'

interface BulkBarProps {
  selectedIds: number[]
  onClear: () => void
  onSelectAll?: () => void
  total?: number
}

/** Floating action bar shown while tasks are multi-selected. */
export function BulkBar({ selectedIds, onClear, onSelectAll, total }: BulkBarProps) {
  const toast = useToast()
  const { data: projects = [] } = useProjects(false)
  const { members, isShared } = useWorkspace()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tag, setTag] = useState('')
  const bulk = useBulk({
    onSuccess: (res, vars) => {
      toast.success(
        `${vars.action.replace('_', ' ')} · ${res.affected} task${res.affected === 1 ? '' : 's'}`,
      )
      if (vars.action === 'delete') onClear()
    },
    onError: (e) => toast.error('Bulk action failed', e.message),
  })

  if (selectedIds.length === 0) return null
  const run = (req: Omit<BulkRequest, 'ids'>) => bulk.mutate({ ids: selectedIds, ...req })

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      data-testid="bulk-bar"
      className="sticky bottom-4 z-30 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-800/95"
    >
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {selectedIds.length} selected
      </span>
      {onSelectAll && total !== undefined && total > selectedIds.length && (
        <Button variant="ghost" size="sm" onClick={onSelectAll}>
          Select all {total}
        </Button>
      )}
      <span className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => run({ action: 'complete' })}
        loading={bulk.isPending}
      >
        <CheckCheck className="h-3.5 w-3.5" /> Complete
      </Button>
      <Select
        aria-label="Set priority"
        className="h-8 w-auto text-xs"
        value=""
        onChange={(e) =>
          e.target.value && run({ action: 'set_priority', priority: e.target.value as Priority })
        }
      >
        <option value="">Priority…</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_META[p].label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Move to project"
        className="h-8 w-auto text-xs"
        value=""
        onChange={(e) => {
          if (e.target.value === '') return
          run({
            action: 'move_to_project',
            project_id: e.target.value === 'inbox' ? null : Number(e.target.value),
          })
        }}
      >
        <option value="">Move to…</option>
        <option value="inbox">Inbox</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Set due date"
        className="h-8 w-auto text-xs"
        value=""
        onChange={(e) => {
          const v = e.target.value
          if (v === '') return
          run({ action: 'set_due_date', due_date: v === 'none' ? null : addDaysISO(Number(v)) })
        }}
      >
        <option value="">Due…</option>
        <option value="0">Today</option>
        <option value="1">Tomorrow</option>
        <option value="7">In a week</option>
        <option value="none">No date</option>
      </Select>
      {isShared && (
        <Select
          aria-label="Assign to"
          className="h-8 w-auto text-xs"
          value=""
          onChange={(e) => {
            if (e.target.value === '') return
            run({
              action: 'assign',
              assignee_id: e.target.value === 'none' ? null : Number(e.target.value),
            })
          }}
        >
          <option value="">Assign…</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.display_name}
            </option>
          ))}
          <option value="none">Unassign</option>
        </Select>
      )}
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (tag.trim()) {
            run({ action: 'add_tag', tag: tag.trim() })
            setTag('')
          }
        }}
      >
        <TagIcon className="h-3.5 w-3.5 text-slate-400" />
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="add tag"
          aria-label="Add tag to selected"
          className="h-8 w-24 text-xs"
        />
      </form>
      <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </Button>
      <Button variant="ghost" size="icon" onClick={onClear} aria-label="Clear selection">
        <X className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          run({ action: 'delete' })
        }}
        title={`Delete ${selectedIds.length} task${selectedIds.length === 1 ? '' : 's'}?`}
        message="This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  )
}

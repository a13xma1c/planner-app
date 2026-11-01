import { Check, ChevronsUpDown, Plus, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useWorkspaces } from '@/api/queries'
import { useClickOutside } from '@/lib/hooks'
import { roleLabel, useWorkspace, workspacePath } from '@/lib/workspaceContext'
import { cn } from '@/lib/utils'

import { Badge } from '../ui/Badge'

/** Dropdown at the top of the sidebar to move between planners or create a shared one. */
export function WorkspaceSwitcher({ onNewWorkspace }: { onNewWorkspace: () => void }) {
  const { workspace, role } = useWorkspace()
  const { data: workspaces = [] } = useWorkspaces()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="workspace-switcher"
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white',
            workspace.is_personal ? 'bg-indigo-600' : 'bg-emerald-600',
          )}
        >
          <Users className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900 dark:text-white">
            {workspace.name}
          </span>
          <span className="block text-[11px] text-slate-500">
            {workspace.is_personal ? 'Personal' : `${workspace.member_count} members`} ·{' '}
            {roleLabel(role)}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch planner"
          className="absolute left-3 right-3 z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="option"
              aria-selected={w.id === workspace.id}
              onClick={() => {
                setOpen(false)
                navigate(workspacePath(w.id))
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800',
                w.id === workspace.id && 'bg-slate-50 dark:bg-slate-800/60',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-800 dark:text-slate-100">{w.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {w.is_personal ? 'Personal' : `${w.member_count} members`}
                  {w.open_task_count > 0 && ` · ${w.open_task_count} open`}
                </span>
              </span>
              {w.role !== 'owner' && (
                <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {roleLabel(w.role)}
                </Badge>
              )}
              {w.id === workspace.id && <Check className="h-4 w-4 text-indigo-600" />}
            </button>
          ))}
          <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onNewWorkspace()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            >
              <Plus className="h-4 w-4" /> New shared planner
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

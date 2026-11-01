import {
  CalendarDays,
  CalendarRange,
  Inbox,
  Kanban,
  LayoutDashboard,
  ListTodo,
  Plus,
  Settings,
  Sun,
  Tags,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router'

import { useOverview, useProjects } from '@/api/queries'
import { cn } from '@/lib/utils'

import { Button } from '../ui/Button'

interface SidebarProps {
  open: boolean
  onClose: () => void
  onNewProject: () => void
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
    isActive
      ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  )

function NavItem({
  to,
  end,
  onClick,
  children,
}: {
  to: string
  end?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <li>
      <NavLink to={to} end={end} className={linkClass} onClick={onClick}>
        {children}
      </NavLink>
    </li>
  )
}

function Count({
  value,
  tone = 'default',
}: {
  value: number | undefined
  tone?: 'default' | 'danger'
}) {
  if (!value) return null
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-1.5 text-[11px] tabular-nums',
        tone === 'danger'
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      )}
    >
      {value}
    </span>
  )
}

export function Sidebar({ open, onClose, onNewProject }: SidebarProps) {
  const { data: projects = [] } = useProjects(false)
  const { data: stats } = useOverview()
  const inboxCount = stats?.projects.find((p) => p.id === null)
  const todayCount = (stats?.due_today ?? 0) + (stats?.overdue ?? 0)

  return (
    <>
      {open && (
        <div
          role="presentation"
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <nav
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform',
          'dark:border-slate-800 dark:bg-slate-950 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <NavLink
            to="/"
            className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"
            onClick={onClose}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <ListTodo className="h-4 w-4" />
            </span>
            Planner
          </NavLink>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
          <ul className="space-y-0.5">
            <NavItem to="/" end onClick={onClose}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </NavItem>
            <NavItem to="/inbox" onClick={onClose}>
              <Inbox className="h-4 w-4" /> Inbox
              <Count value={inboxCount ? inboxCount.total - inboxCount.done : 0} />
            </NavItem>
            <NavItem to="/today" onClick={onClose}>
              <Sun className="h-4 w-4" /> Today
              <Count value={todayCount} tone={stats?.overdue ? 'danger' : 'default'} />
            </NavItem>
            <NavItem to="/upcoming" onClick={onClose}>
              <CalendarRange className="h-4 w-4" /> Upcoming
              <Count value={stats?.due_this_week} />
            </NavItem>
            <NavItem to="/tasks" onClick={onClose}>
              <ListTodo className="h-4 w-4" /> All tasks
              <Count value={stats?.open} />
            </NavItem>
            <NavItem to="/board" onClick={onClose}>
              <Kanban className="h-4 w-4" /> Board
            </NavItem>
            <NavItem to="/calendar" onClick={onClose}>
              <CalendarDays className="h-4 w-4" /> Calendar
            </NavItem>
          </ul>

          <div>
            <div className="mb-1 flex items-center justify-between px-2.5">
              <NavLink
                to="/projects"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                onClick={onClose}
              >
                Projects
              </NavLink>
              <button
                type="button"
                onClick={onNewProject}
                aria-label="New project"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-0.5" data-testid="sidebar-projects">
              {projects.length === 0 && (
                <li className="px-2.5 py-1 text-xs text-slate-400">No projects yet</li>
              )}
              {projects.map((p) => (
                <NavItem key={p.id} to={`/projects/${p.id}`} onClick={onClose}>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="truncate">{p.name}</span>
                  <Count
                    value={p.task_count - p.done_count}
                    tone={p.overdue_count ? 'danger' : 'default'}
                  />
                </NavItem>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <ul className="space-y-0.5">
            <NavItem to="/tags" onClick={onClose}>
              <Tags className="h-4 w-4" /> Tags
            </NavItem>
            <NavItem to="/settings" onClick={onClose}>
              <Settings className="h-4 w-4" /> Settings
            </NavItem>
          </ul>
        </div>
      </nav>
    </>
  )
}

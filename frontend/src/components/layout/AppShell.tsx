import { Eye, HelpCircle, Menu, Moon, Plus, Sun } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useOverview } from '@/api/queries'
import { useHotkeys } from '@/lib/hooks'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useTaskPanel } from '@/lib/taskPanel'
import { useTheme } from '@/lib/themeContext'
import { useWorkspace } from '@/lib/workspaceContext'

import { ProjectDialog } from '../projects/ProjectDialog'
import { QuickAdd, type QuickAddHandle } from '../tasks/QuickAdd'
import { TaskDetailPanel } from '../tasks/TaskDetailPanel'
import { TaskFormDialog } from '../tasks/TaskFormDialog'
import { Button } from '../ui/Button'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { WorkspaceDialog } from '../workspace/WorkspaceDialog'
import { ShortcutsDialog } from './ShortcutsDialog'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'

const GO_ROUTES: Record<string, string> = {
  d: '',
  i: '/inbox',
  t: '/today',
  u: '/upcoming',
  a: '/tasks',
  b: '/board',
  c: '/calendar',
  p: '/projects',
  m: '/members',
  s: '/settings',
}

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const quickAddRef = useRef<QuickAddHandle>(null)
  const goPending = useRef<number | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { taskId, open: openTask, close: closeTask } = useTaskPanel()
  const { resolved, toggle } = useTheme()
  const { path, canEdit, workspace } = useWorkspace()
  const { data: stats } = useOverview()
  useDocumentTitle(stats ? stats.due_today + stats.overdue : undefined, workspace.name)

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  useHotkeys([
    { combo: 'n', handler: () => canEdit && quickAddRef.current?.focus() },
    { combo: 'shift+n', handler: () => canEdit && setNewTaskOpen(true) },
    {
      combo: '/',
      handler: () => {
        const search = document.querySelector<HTMLInputElement>('[data-testid="search-input"]')
        ;(search ?? null)?.focus()
        if (!search) quickAddRef.current?.focus()
      },
    },
    { combo: '?', handler: () => setHelpOpen((v) => !v) },
    {
      combo: 'g',
      handler: () => {
        goPending.current = window.setTimeout(() => (goPending.current = null), 1200)
      },
    },
    ...Object.entries(GO_ROUTES).map(([key, suffix]) => ({
      combo: key,
      handler: () => {
        if (goPending.current === null) return false // not part of a "g …" sequence
        window.clearTimeout(goPending.current)
        goPending.current = null
        navigate(path(suffix))
        return true
      },
    })),
  ])

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        onNewProject={() => setNewProjectOpen(true)}
        onNewWorkspace={() => setNewWorkspaceOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {canEdit ? (
            <QuickAdd ref={quickAddRef} className="mx-auto w-full max-w-2xl" onCreated={openTask} />
          ) : (
            <div
              data-testid="view-only-banner"
              className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-600"
            >
              <Eye className="h-4 w-4" /> You can view “{workspace.name}” but not edit it.
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setNewTaskOpen(true)}
                data-testid="new-task-button"
              >
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New task</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              data-testid="theme-toggle"
            >
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHelpOpen(true)}
              aria-label="Keyboard shortcuts"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <UserMenu />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
          </div>
        </main>
      </div>

      <TaskDetailPanel taskId={taskId} onClose={closeTask} />
      <TaskFormDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreated={openTask}
      />
      <ProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onSaved={(p) => navigate(path(`/projects/${p.id}`))}
      />
      <WorkspaceDialog open={newWorkspaceOpen} onClose={() => setNewWorkspaceOpen(false)} />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

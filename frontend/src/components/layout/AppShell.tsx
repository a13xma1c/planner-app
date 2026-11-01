import { HelpCircle, Menu, Moon, Plus, Sun } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'

import { useHotkeys } from '@/lib/hooks'
import { useTaskPanel } from '@/lib/taskPanel'
import { useTheme } from '@/lib/themeContext'

import { ProjectDialog } from '../projects/ProjectDialog'
import { QuickAdd, type QuickAddHandle } from '../tasks/QuickAdd'
import { TaskDetailPanel } from '../tasks/TaskDetailPanel'
import { TaskFormDialog } from '../tasks/TaskFormDialog'
import { Button } from '../ui/Button'
import { ShortcutsDialog } from './ShortcutsDialog'
import { Sidebar } from './Sidebar'

const GO_ROUTES: Record<string, string> = {
  d: '/',
  i: '/inbox',
  t: '/today',
  u: '/upcoming',
  a: '/tasks',
  b: '/board',
  c: '/calendar',
  p: '/projects',
  s: '/settings',
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const quickAddRef = useRef<QuickAddHandle>(null)
  const goPending = useRef<number | null>(null)
  const navigate = useNavigate()
  const { taskId, open: openTask, close: closeTask } = useTaskPanel()
  const { resolved, toggle } = useTheme()

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  useHotkeys([
    { combo: 'n', handler: () => quickAddRef.current?.focus() },
    { combo: 'shift+n', handler: () => setNewTaskOpen(true) },
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
    ...Object.entries(GO_ROUTES).map(([key, path]) => ({
      combo: key,
      handler: () => {
        if (goPending.current !== null) {
          window.clearTimeout(goPending.current)
          goPending.current = null
          navigate(path)
        }
      },
    })),
  ])

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        onNewProject={() => setNewProjectOpen(true)}
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
          <QuickAdd ref={quickAddRef} className="mx-auto w-full max-w-2xl" onCreated={openTask} />
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setNewTaskOpen(true)}
              data-testid="new-task-button"
            >
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New task</span>
            </Button>
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
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            <Outlet />
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
        onSaved={(p) => navigate(`/projects/${p.id}`)}
      />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

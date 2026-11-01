import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider } from '@/lib/theme'
import { BoardPage } from '@/pages/BoardPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TagsPage } from '@/pages/TagsPage'
import { TasksPage } from '@/pages/TasksPage'

import { createQueryClient } from './lib/queryClient'

/** Route table (a data router so navigations can opt into `flushSync`). */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'tasks', element: <TasksPage mode="all" /> },
      { path: 'inbox', element: <TasksPage mode="inbox" /> },
      { path: 'today', element: <TasksPage mode="today" /> },
      { path: 'upcoming', element: <TasksPage mode="upcoming" /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <TasksPage mode="project" /> },
      { path: 'board', element: <BoardPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'tags', element: <TagsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export function Providers({
  children,
  client,
}: {
  children: React.ReactNode
  client?: QueryClient
}) {
  const [queryClient] = useState(() => client ?? createQueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default function App() {
  const [router] = useState(() => createBrowserRouter(routes))
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}

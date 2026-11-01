import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ToastProvider } from '@/components/ui/Toast'
import {
  LegacyPathRedirect,
  WorkspaceLayout,
  WorkspaceRedirect,
} from '@/components/workspace/WorkspaceLayout'
import { RedirectIfAuthenticated, RequireAuth } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { BoardPage } from '@/pages/BoardPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { JoinPage } from '@/pages/JoinPage'
import { LoginPage } from '@/pages/LoginPage'
import { MembersPage } from '@/pages/MembersPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TagsPage } from '@/pages/TagsPage'
import { TasksPage } from '@/pages/TasksPage'

import { createQueryClient } from './lib/queryClient'

/** Route table (a data router so navigations can opt into `flushSync`). */
export const routes: RouteObject[] = [
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
    ],
  },
  { path: 'join/:token', element: <JoinPage /> },
  {
    element: <RequireAuth />,
    children: [
      { index: true, element: <WorkspaceRedirect /> },
      {
        path: 'w/:workspaceId',
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'tasks', element: <TasksPage mode="all" /> },
          { path: 'inbox', element: <TasksPage mode="inbox" /> },
          { path: 'today', element: <TasksPage mode="today" /> },
          { path: 'upcoming', element: <TasksPage mode="upcoming" /> },
          { path: 'assigned', element: <TasksPage mode="assigned" /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:projectId', element: <TasksPage mode="project" /> },
          { path: 'board', element: <BoardPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'tags', element: <TagsPage /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      // pre-workspace bookmarks such as /board or /tasks?status=done
      { path: '*', element: <LegacyPathRedirect /> },
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
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  )
}

import { QueryClient } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

import { Providers, routes as appRoutes } from '@/App'
import type { Member, User, WorkspaceSummary } from '@/api/types'
import { WorkspaceContext, workspacePath, type WorkspaceContextValue } from '@/lib/workspaceContext'

import { db, ME, PERSONAL_WS_ID } from './fakeApi'
import { makeMember } from './fixtures'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export interface WorkspaceOverrides {
  workspace?: Partial<WorkspaceSummary>
  members?: Member[]
  me?: User
}

/** Build a workspace context value; defaults to the signed-in user's personal planner. */
export function makeWorkspaceValue({
  workspace = {},
  members,
  me = db.currentUser ?? ME,
}: WorkspaceOverrides = {}): WorkspaceContextValue {
  const ws: WorkspaceSummary = {
    id: PERSONAL_WS_ID,
    name: "Me's planner",
    is_personal: true,
    created_at: '2025-01-01T00:00:00',
    role: 'owner',
    member_count: 1,
    open_task_count: 0,
    ...workspace,
  }
  const list = members ?? [makeMember(me, { role: ws.role })]
  return {
    workspace: ws,
    members: list,
    me,
    role: ws.role,
    canEdit: ws.role !== 'viewer',
    isOwner: ws.role === 'owner',
    isShared: !ws.is_personal || ws.member_count > 1,
    path: (suffix = '') => workspacePath(ws.id, suffix),
  }
}

interface Options extends Omit<RenderOptions, 'wrapper'>, WorkspaceOverrides {
  /** Initial URL, e.g. "/w/1/tasks?status=done" */
  route?: string
  /** Route pattern to mount the element under (for useParams). Defaults to "*". */
  path?: string
  /** Render without a workspace context (auth pages etc.). */
  noWorkspace?: boolean
}

function mount(routes: RouteObject[], route: string, options: Omit<RenderOptions, 'wrapper'>) {
  const client = createTestQueryClient()
  const user = userEvent.setup()
  const router = createMemoryRouter(routes, { initialEntries: [route] })
  const utils = render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
    options,
  )
  return { user, client, router, ...utils }
}

/** Providers only (no router) – for components that don't touch routing. */
export function renderWithoutRouter(
  ui: ReactElement,
  { workspace, members, me, ...options }: Omit<Options, 'route' | 'path'> = {},
) {
  const client = createTestQueryClient()
  const value = makeWorkspaceValue({ workspace, members, me })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Providers client={client}>
      <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    </Providers>
  )
  return { user: userEvent.setup(), client, ...render(ui, { wrapper: Wrapper, ...options }) }
}

/** Render a component with all app providers + workspace context inside a memory data-router. */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/w/1',
    path = '*',
    workspace,
    members,
    me,
    noWorkspace = false,
    ...options
  }: Options = {},
) {
  const value = makeWorkspaceValue({ workspace, members, me })
  const element = noWorkspace ? (
    ui
  ) : (
    <WorkspaceContext.Provider value={value}>{ui}</WorkspaceContext.Provider>
  )
  return mount([{ path, element }], route, options)
}

/** Render the full application route table at the given URL (signed in as "Me" by default). */
export function renderApp(route = '/', options: Omit<RenderOptions, 'wrapper'> = {}) {
  return mount(appRoutes, route, options)
}

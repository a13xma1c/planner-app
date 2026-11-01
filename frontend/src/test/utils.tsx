import { QueryClient } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

import { Providers, routes as appRoutes } from '@/App'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** Initial URL, e.g. "/tasks?status=done" */
  route?: string
  /** Route pattern to mount the element under (for useParams). Defaults to "*". */
  path?: string
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
  options: Omit<RenderOptions, 'wrapper'> = {},
) {
  const client = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Providers client={client}>{children}</Providers>
  )
  return { user: userEvent.setup(), client, ...render(ui, { wrapper: Wrapper, ...options }) }
}

/** Render a component with all app providers inside a memory data-router. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path = '*', ...options }: Options = {},
) {
  return mount([{ path, element: ui }], route, options)
}

/** Render the full application route table at the given URL. */
export function renderApp(route = '/', options: Omit<RenderOptions, 'wrapper'> = {}) {
  return mount(appRoutes, route, options)
}

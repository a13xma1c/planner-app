import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { UNAUTHORIZED_EVENT } from '@/api/client'
import { db } from '@/test/fakeApi'
import { renderWithProviders } from '@/test/utils'

import { RedirectIfAuthenticated, RequireAuth } from './auth'
import { nextPath } from './navigation'

function Tree() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<h1>Login page</h1>} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/w/1/tasks" element={<h1>Private page</h1>} />
      </Route>
    </Routes>
  )
}

describe('nextPath', () => {
  it('only accepts same-origin absolute paths', () => {
    expect(nextPath('?next=%2Fw%2F3%2Fboard')).toBe('/w/3/board')
    expect(nextPath('?next=https://evil.example')).toBe('/')
    expect(nextPath('?next=//evil.example')).toBe('/')
    expect(nextPath('')).toBe('/')
  })
})

describe('RequireAuth', () => {
  it('renders private pages for signed-in users', async () => {
    renderWithProviders(<Tree />, { route: '/w/1/tasks', noWorkspace: true })
    expect(await screen.findByText('Private page')).toBeInTheDocument()
  })

  it('redirects signed-out users to /login with a next param', async () => {
    db.currentUser = null
    const { router } = renderWithProviders(<Tree />, { route: '/w/1/tasks?x=1', noWorkspace: true })
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?next=%2Fw%2F1%2Ftasks%3Fx%3D1')
  })

  it('reacts to a 401 from any API call by going to /login', async () => {
    renderWithProviders(<Tree />, { route: '/w/1/tasks', noWorkspace: true })
    await screen.findByText('Private page')
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })
})

describe('RedirectIfAuthenticated', () => {
  it('sends signed-in users to the next path', async () => {
    const { router } = renderWithProviders(<Tree />, {
      route: '/login?next=%2Fw%2F1%2Ftasks',
      noWorkspace: true,
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/w/1/tasks'))
    expect(await screen.findByText('Private page')).toBeInTheDocument()
  })

  it('shows the login page to signed-out users', async () => {
    db.currentUser = null
    renderWithProviders(<Tree />, { route: '/login', noWorkspace: true })
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })
})

import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { db, seedWorkspace } from '@/test/fakeApi'
import { makeInvitation, makeUser } from '@/test/fixtures'
import { renderApp } from '@/test/utils'

describe('LoginPage', () => {
  it('signs in and continues to the requested page', async () => {
    db.users.push(makeUser({ id: 7, email: 'ann@example.com', display_name: 'Ann' }))
    db.currentUser = null
    const { user, router } = renderApp('/login?next=%2Fw%2F1%2Fboard')
    await user.type(await screen.findByLabelText('Email'), 'ann@example.com')
    await user.type(screen.getByLabelText('Password'), 'orbit-cactus-lantern-7')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/w/1/board'))
  })

  it('shows the server error for bad credentials', async () => {
    db.currentUser = null
    const { user } = renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'me@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
  })

  it('links to registration keeping the next param', async () => {
    db.currentUser = null
    renderApp('/login?next=%2Fjoin%2Fabc')
    expect(await screen.findByRole('link', { name: 'Create one' })).toHaveAttribute(
      'href',
      '/register?next=%2Fjoin%2Fabc',
    )
  })
})

describe('LoginPage password visibility', () => {
  it('has a working show/hide toggle', async () => {
    db.currentUser = null
    const { user } = renderApp('/login')
    const input = await screen.findByLabelText('Password')
    await user.type(input, 'hunter2-hunter2')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('hunter2-hunter2')
    expect(screen.queryByTestId('password-strength')).not.toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  it('creates an account and lands in the new personal planner', async () => {
    db.currentUser = null
    const { user, router } = renderApp('/register')
    await user.type(await screen.findByLabelText('Your name'), 'Zed')
    await user.type(screen.getByLabelText('Email'), 'zed@example.com')
    await user.type(screen.getByLabelText('Password'), 'orbit-cactus-lantern-7')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/w\/\d+$/))
    expect(db.currentUser).toMatchObject({ display_name: 'Zed' })
    expect(await screen.findByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument()
  })

  it('keeps the button disabled until the password passes the policy, with live feedback', async () => {
    db.currentUser = null
    const { user } = renderApp('/register')
    await user.type(await screen.findByLabelText('Your name'), 'Ann Lee')
    await user.type(screen.getByLabelText('Email'), 'ann@example.com')
    const button = screen.getByRole('button', { name: 'Create account' })
    expect(button).toBeDisabled()

    const password = screen.getByLabelText('Password')
    await user.type(password, 'password123')
    expect(screen.getByTestId('password-label')).toHaveTextContent('Very weak')
    expect(screen.getByTestId('check-common')).toHaveAttribute('data-passed', 'false')
    expect(button).toBeDisabled()

    await user.clear(password)
    await user.type(password, 'ann-lee-rocks-2030')
    expect(screen.getByTestId('check-personal')).toHaveAttribute('data-passed', 'false')
    expect(button).toBeDisabled()

    await user.clear(password)
    await user.type(password, 'velvet-otter-glacier-3')
    expect(screen.getByTestId('password-label')).toHaveTextContent('Strong')
    expect(button).toBeEnabled()
  })

  it('reports duplicate emails', async () => {
    db.currentUser = null
    const { user } = renderApp('/register')
    await user.type(await screen.findByLabelText('Your name'), 'Me again')
    await user.type(screen.getByLabelText('Email'), 'me@example.com')
    await user.type(screen.getByLabelText('Password'), 'orbit-cactus-lantern-7')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
  })
})

describe('JoinPage', () => {
  it('previews the invitation and joins the planner', async () => {
    const ws = seedWorkspace({ name: 'Team Rocket', role: 'owner' })
    const inv = makeInvitation({ token: 'abc', role: 'editor' })
    db.invitations.push({ ...inv, workspace_id: ws.id })
    const bob = makeUser({ display_name: 'Bob' })
    db.users.push(bob)
    db.currentUser = bob
    const { user, router } = renderApp('/join/abc')
    expect(await screen.findByRole('heading', { name: 'Join "Team Rocket"' })).toBeInTheDocument()
    expect(screen.getByText(/invited you to collaborate as editor/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join as Bob' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${ws.id}`))
    expect(db.members.some((m) => m.workspace_id === ws.id && m.user.id === bob.id)).toBe(true)
  })

  it('redirects signed-out visitors to login and back', async () => {
    const ws = seedWorkspace({ name: 'X' })
    db.invitations.push({ ...makeInvitation({ token: 'abc' }), workspace_id: ws.id })
    db.currentUser = null
    const { router } = renderApp('/join/abc')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Fjoin%2Fabc')
  })

  it('explains invalid and expired links', async () => {
    renderApp('/join/nope')
    expect(await screen.findByRole('heading', { name: 'Invitation not found' })).toBeInTheDocument()
    const ws = seedWorkspace({ name: 'Y' })
    db.invitations.push({
      ...makeInvitation({ token: 'old', is_valid: false }),
      workspace_id: ws.id,
    })
    renderApp('/join/old')
    expect(await screen.findByText(/expired or been revoked/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Join as/ })).toBeDisabled()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { db, seedProject, seedTask } from '@/test/fakeApi'
import { renderWithProviders } from '@/test/utils'

import { AppShell } from './AppShell'

function Shell({ route = '/' }: { route?: string } = {}) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<h1>Home page</h1>} />
        <Route path="tasks" element={<h1>Tasks page</h1>} />
        <Route path="board" element={<h1>Board page</h1>} />
        <Route path="projects/:id" element={<h1>Project page</h1>} />
      </Route>
    </Routes>,
    { route },
  )
}

describe('AppShell', () => {
  it('renders navigation with live counts and projects', async () => {
    seedTask({ title: 'inbox item' })
    seedProject({ name: 'Alpha' })
    Shell()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/')
    expect(
      await within(screen.getByTestId('sidebar-projects')).findByText('Alpha'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Inbox/ })).toHaveTextContent('1'),
    )
    expect(screen.getByText('Home page')).toBeInTheDocument()
  })

  it('opens the task panel from ?task= and closes it', async () => {
    const t = seedTask({ title: 'Panel me' })
    const { user } = Shell({ route: `/tasks?task=${t.id}` })
    expect(await screen.findByLabelText('Task title')).toHaveValue('Panel me')
    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    await waitFor(() => expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument())
  })

  it('supports keyboard shortcuts: n focuses quick add, shift+n opens the form, g+b navigates, ? shows help', async () => {
    const { user } = Shell()
    await user.keyboard('n')
    expect(screen.getByLabelText('Quick add task')).toHaveFocus()
    await user.keyboard('{Escape}')
    ;(document.activeElement as HTMLElement).blur()

    await user.keyboard('{Shift>}N{/Shift}')
    expect(await screen.findByRole('dialog', { name: 'New task' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New task' })).not.toBeInTheDocument(),
    )

    await user.keyboard('gb')
    expect(await screen.findByText('Board page')).toBeInTheDocument()

    await user.keyboard('?')
    expect(
      await screen.findByRole('dialog', { name: 'Keyboard shortcuts & syntax' }),
    ).toBeInTheDocument()
  })

  it('toggles the theme and persists it', async () => {
    const { user } = Shell()
    await user.click(screen.getByTestId('theme-toggle'))
    expect(document.documentElement).toHaveClass('dark')
    expect(JSON.parse(localStorage.getItem('planner.theme')!)).toBe('dark')
    await user.click(screen.getByTestId('theme-toggle'))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('creates a task via the New task button and opens it', async () => {
    const { user } = Shell()
    await user.click(screen.getByTestId('new-task-button'))
    await user.type(screen.getByLabelText('Title'), 'From form')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(db.tasks).toHaveLength(1))
    expect(await screen.findByLabelText('Task title')).toHaveValue('From form')
  })

  it('creates a project from the sidebar and navigates to it', async () => {
    const { user } = Shell()
    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.type(screen.getByLabelText('Name'), 'Brand new')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Project page')).toBeInTheDocument()
    expect(db.projects[0]!.name).toBe('Brand new')
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { db, seedProject, seedTask, todayISO } from '@/test/fakeApi'
import { renderApp } from '@/test/utils'

const shiftDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const app = (route: string) => renderApp(route)

describe('DashboardPage', () => {
  it('shows stats, focus list and project progress', async () => {
    const p = seedProject({ name: 'Work' })
    seedTask({ title: 'Overdue one', due_date: shiftDays(-1), priority: 'urgent' })
    seedTask({ title: 'Today one', due_date: todayISO(), project_id: p.id })
    seedTask({ title: 'Soon', due_date: shiftDays(2) })
    seedTask({ title: 'Finished', status: 'done', completed_at: new Date().toISOString() })
    app('/')
    expect(await screen.findByText(/^Good (morning|afternoon|evening)$/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('stat-open')).toHaveTextContent('3'))
    expect(screen.getByTestId('stat-overdue')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-due-today')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-streak')).toHaveTextContent('1d')
    expect(screen.getByTestId('stat-completion')).toHaveTextContent('25%')
    const focus = screen.getByRole('region', { name: 'Focus for today' })
    expect(within(focus).getByText('Overdue one')).toBeInTheDocument()
    expect(within(focus).getByText('Today one')).toBeInTheDocument()
    expect(within(focus).queryByText('Soon')).not.toBeInTheDocument()
    expect(screen.getByText('Soon')).toBeInTheDocument() // in "Coming up"
    const projects = screen.getByRole('region', { name: 'Projects' })
    expect(within(projects).getByRole('link', { name: /Work/ })).toHaveAttribute(
      'href',
      `/projects/${p.id}`,
    )
  })
})

describe('TasksPage', () => {
  it('lists tasks, hides done by default and reacts to URL filters', async () => {
    seedTask({ title: 'Open thing', priority: 'high' })
    seedTask({ title: 'Done thing', status: 'done' })
    const { user } = app('/tasks')
    expect(await screen.findByText('Open thing')).toBeInTheDocument()
    expect(screen.queryByText('Done thing')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Show completed'))
    expect(await screen.findByText('Done thing')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Low' }))
    await waitFor(() => expect(screen.queryByText('Open thing')).not.toBeInTheDocument())
    expect(screen.getByText('No tasks here')).toBeInTheDocument()
    expect(screen.getByText('Try clearing some filters.')).toBeInTheDocument()
  })

  it('groups Today into overdue / today sections', async () => {
    seedTask({ title: 'Late', due_date: shiftDays(-3) })
    seedTask({ title: 'Now', due_date: todayISO() })
    seedTask({ title: 'Future', due_date: shiftDays(3) })
    app('/today')
    expect(await screen.findByText('Late')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Overdue' })).getByText('Late'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Today' })).getByText('Now'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Future')).not.toBeInTheDocument()
  })

  it('groups Upcoming by day', async () => {
    seedTask({ title: 'Tmrw', due_date: shiftDays(1) })
    seedTask({ title: 'Far', due_date: shiftDays(40) })
    app('/upcoming')
    expect(await screen.findByText('Tmrw')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /^Tomorrow/ })).toBeInTheDocument()
    expect(screen.queryByText('Far')).not.toBeInTheDocument()
  })

  it('shows the inbox only', async () => {
    const p = seedProject({ name: 'P' })
    seedTask({ title: 'In project', project_id: p.id })
    seedTask({ title: 'Loose' })
    app('/inbox')
    expect(await screen.findByText('Loose')).toBeInTheDocument()
    expect(screen.queryByText('In project')).not.toBeInTheDocument()
  })

  it('shows a project with header actions and deletes it', async () => {
    const p = seedProject({ name: 'Doomed', description: 'desc' })
    seedTask({ title: 'Survivor', project_id: p.id })
    const { user } = app(`/projects/${p.id}`)
    expect(await screen.findByText('Survivor')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Doomed/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Archive/ }))
    await waitFor(() => expect(db.projects[0]!.is_archived).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete project' }),
    )
    await waitFor(() => expect(db.projects).toHaveLength(0))
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(db.tasks[0]!.project_id).toBeNull()
  })

  it('supports bulk selection from the list', async () => {
    seedTask({ title: 'A' })
    seedTask({ title: 'B' })
    const { user } = app('/tasks')
    await user.click(await screen.findByRole('checkbox', { name: 'Select A' }))
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent('1 selected')
    await user.click(screen.getByRole('button', { name: 'Select all 2' }))
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent('2 selected')
    await user.click(screen.getByRole('button', { name: /Complete/ }))
    await waitFor(() => expect(db.tasks.every((t) => t.status === 'done')).toBe(true))
  })

  it('filters by a specific due date from the calendar', async () => {
    seedTask({ title: 'On the day', due_date: '2030-05-05' })
    seedTask({ title: 'Other day', due_date: '2030-05-06' })
    const { user } = app('/tasks?due=2030-05-05')
    expect(await screen.findByText('On the day')).toBeInTheDocument()
    expect(screen.queryByText('Other day')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Due Sunday, 5 May 2030/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear date' }))
    expect(await screen.findByText('Other day')).toBeInTheDocument()
  })

  it('redirects invalid project ids', async () => {
    app('/projects/abc')
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })
})

describe('BoardPage', () => {
  it('renders columns and filters by project', async () => {
    const p = seedProject({ name: 'Only' })
    seedTask({ title: 'Mine', project_id: p.id, status: 'in_progress' })
    seedTask({ title: 'Other' })
    const { user } = app('/board')
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Filter board by project'), String(p.id))
    await waitFor(() => expect(screen.queryByText('Other')).not.toBeInTheDocument())
    expect(within(screen.getByTestId('column-in_progress')).getByText('Mine')).toBeInTheDocument()
  })
})

describe('CalendarPage', () => {
  it('shows tasks for the month from the URL', async () => {
    seedTask({ title: 'Xmas', due_date: '2030-12-25' })
    app('/calendar?month=2030-12')
    expect(await screen.findByText('Xmas')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('December 2030')
  })
})

describe('ProjectsPage', () => {
  it('creates and edits projects', async () => {
    const { user } = app('/projects')
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    await user.click(screen.getByTestId('new-project-button'))
    await user.type(screen.getByLabelText('Name'), 'Garden')
    await user.click(screen.getByRole('radio', { name: '#10b981' }))
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(
      await within(screen.getByTestId('project-grid')).findByText('Garden'),
    ).toBeInTheDocument()
    expect(db.projects[0]!.color).toBe('#10b981')

    await user.click(screen.getByText('Edit'))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Garden 2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await within(screen.getByTestId('project-grid')).findByText('Garden 2'),
    ).toBeInTheDocument()
  })

  it('surfaces duplicate-name errors inline', async () => {
    seedProject({ name: 'Taken' })
    const { user } = app('/projects')
    await user.click(await screen.findByTestId('new-project-button'))
    await user.type(screen.getByLabelText('Name'), 'taken')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Project 'taken' already exists")
  })

  it('toggles archived visibility', async () => {
    seedProject({ name: 'Live' })
    seedProject({ name: 'Old', is_archived: true })
    const { user } = app('/projects')
    expect(await screen.findByText('Live')).toBeInTheDocument()
    expect(screen.queryByText('Old')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Show archived'))
    expect(screen.getByText('Old')).toBeInTheDocument()
  })
})

describe('TagsPage', () => {
  it('creates, renames and deletes tags', async () => {
    seedTask({ title: 't', tagNames: ['work'] })
    const { user } = app('/tags')
    const table = await screen.findByTestId('tags-table')
    expect(within(table).getByDisplayValue('work')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: '1' })).toHaveAttribute(
      'href',
      '/tasks?tag=work&done=1',
    )

    await user.type(screen.getByLabelText('New tag name'), 'Fresh{Enter}')
    expect(await within(table).findByDisplayValue('fresh')).toBeInTheDocument()

    const rename = within(table).getByLabelText('Rename tag work')
    await user.clear(rename)
    await user.type(rename, 'job{Enter}')
    await waitFor(() => expect(db.tags.some((t) => t.name === 'job')).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Delete tag fresh' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete tag' }))
    await waitFor(() => expect(db.tags.map((t) => t.name)).toEqual(['job']))
  })
})

describe('SettingsPage', () => {
  it('switches theme and shows version', async () => {
    const { user } = app('/settings')
    await waitFor(() => expect(screen.getByTestId('app-version')).toHaveTextContent('test'))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
  })

  it('imports a legacy file and reports the result', async () => {
    const { user } = app('/settings')
    const input = (await screen.findByTestId('import-legacy-input')) as HTMLInputElement
    const file = new File(
      [JSON.stringify({ tasks: [{ title: 'old' }], projects: [] })],
      'planner_data.json',
      { type: 'application/json' },
    )
    await user.upload(input, file)
    expect(await screen.findByTestId('import-result')).toHaveTextContent('1 tasks, 1 projects')
    expect(screen.getByTestId('import-result')).toHaveTextContent("Created missing project 'Ghost'")
  })

  it('rejects non-JSON uploads', async () => {
    const { user } = app('/settings')
    const input = (await screen.findByTestId('import-legacy-input')) as HTMLInputElement
    await user.upload(input, new File(['not json'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Invalid file')
  })

  it('asks for confirmation before a replace import', async () => {
    const { user } = app('/settings')
    await user.click(await screen.findByRole('button', { name: 'Import (replace)' }))
    const input = screen.getByTestId('import-bundle-input') as HTMLInputElement
    await user.upload(
      input,
      new File([JSON.stringify({ version: 2, tasks: [{ title: 'a' }] })], 'b.json', {
        type: 'application/json',
      }),
    )
    expect(await screen.findByRole('dialog', { name: 'Replace all data?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replace everything' }))
    expect(await screen.findByTestId('import-result')).toHaveTextContent('1 tasks')
  })
})

describe('NotFoundPage', () => {
  it('renders for unknown routes', async () => {
    app('/nope/nothing')
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
  })
})

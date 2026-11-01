/** MSW request handlers backed by the in-memory fake API. */
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { setupServer } from 'msw/node'

import type {
  BulkRequest,
  Project,
  Status,
  Subtask,
  Tag,
  TaskCreate,
  TaskUpdate,
} from '@/api/types'

import * as fake from './fakeApi'
import { makeProject, makeTag } from './fixtures'

const json = (body: JsonBodyType, status = 200) => HttpResponse.json(body, { status })
const notFound = (what: string) => json({ detail: `${what} not found` }, 404)
const id = (params: Record<string, string | readonly string[] | undefined>, key = 'id') =>
  Number(params[key])

export const handlers = [
  http.get('/api/health', () => json({ status: 'ok', version: 'test', database: 'memory' })),

  // ── tasks ────────────────────────────────────────────────────────────────
  http.get('/api/tasks', ({ request }) => json(fake.listTasks(new URL(request.url).searchParams))),
  http.get('/api/tasks/upcoming', ({ request }) =>
    json(fake.upcoming(Number(new URL(request.url).searchParams.get('days') ?? 7))),
  ),
  http.post('/api/tasks', async ({ request }) => {
    const body = (await request.json()) as TaskCreate
    if (!body.title?.trim())
      return json(
        { detail: [{ loc: ['body', 'title'], msg: 'String should have at least 1 character' }] },
        422,
      )
    return json(fake.createTask(body), 201)
  }),
  http.post('/api/tasks/quick-add', async ({ request }) => {
    const body = (await request.json()) as { text: string; dry_run?: boolean }
    return json(fake.quickAdd(body.text, !!body.dry_run), 201)
  }),
  http.post('/api/tasks/bulk', async ({ request }) =>
    json(fake.bulk((await request.json()) as BulkRequest)),
  ),
  http.post('/api/tasks/reorder', async ({ request }) => {
    const body = (await request.json()) as { status: Status; ordered_ids: number[] }
    return json(fake.reorder(body.status, body.ordered_ids))
  }),
  http.get('/api/tasks/:id', ({ params }) => {
    const t = fake.getTask(id(params))
    return t ? json(t) : notFound(`Task ${params.id}`)
  }),
  http.patch('/api/tasks/:id', async ({ params, request }) => {
    const t = fake.updateTask(id(params), (await request.json()) as TaskUpdate)
    return t ? json(t) : notFound(`Task ${params.id}`)
  }),
  http.delete('/api/tasks/:id', ({ params }) =>
    fake.deleteTask(id(params))
      ? new HttpResponse(null, { status: 204 })
      : notFound(`Task ${params.id}`),
  ),
  http.post('/api/tasks/:id/complete', ({ params }) => {
    const r = fake.completeTask(id(params))
    return r ? json(r) : notFound(`Task ${params.id}`)
  }),
  http.post('/api/tasks/:id/reopen', ({ params }) => {
    const t = fake.reopenTask(id(params))
    return t ? json(t) : notFound(`Task ${params.id}`)
  }),

  // ── subtasks ─────────────────────────────────────────────────────────────
  http.post('/api/tasks/:id/subtasks', async ({ params, request }) => {
    const body = (await request.json()) as { title: string }
    const s = fake.addSubtask(id(params), body.title)
    return s ? json(s, 201) : notFound(`Task ${params.id}`)
  }),
  http.patch('/api/subtasks/:id', async ({ params, request }) => {
    const s = fake.updateSubtask(id(params), (await request.json()) as Partial<Subtask>)
    return s ? json(s) : notFound(`Subtask ${params.id}`)
  }),
  http.delete('/api/subtasks/:id', ({ params }) =>
    fake.deleteSubtask(id(params))
      ? new HttpResponse(null, { status: 204 })
      : notFound(`Subtask ${params.id}`),
  ),

  // ── projects ─────────────────────────────────────────────────────────────
  http.get('/api/projects', ({ request }) =>
    json(
      fake.projectsWithStats(new URL(request.url).searchParams.get('include_archived') !== 'false'),
    ),
  ),
  http.post('/api/projects', async ({ request }) => {
    const body = (await request.json()) as Partial<Project>
    if (fake.db.projects.some((p) => p.name.toLowerCase() === body.name?.toLowerCase()))
      return json({ detail: `Project '${body.name}' already exists` }, 409)
    const p = makeProject(body)
    fake.db.projects.push(p)
    return json(p, 201)
  }),
  http.get('/api/projects/:id', ({ params }) => {
    const p = fake.db.projects.find((x) => x.id === id(params))
    return p ? json(p) : notFound(`Project ${params.id}`)
  }),
  http.patch('/api/projects/:id', async ({ params, request }) => {
    const p = fake.db.projects.find((x) => x.id === id(params))
    if (!p) return notFound(`Project ${params.id}`)
    Object.assign(p, await request.json())
    return json(p)
  }),
  http.delete('/api/projects/:id', ({ params }) => {
    const pid = id(params)
    if (!fake.db.projects.some((x) => x.id === pid)) return notFound(`Project ${params.id}`)
    fake.db.projects = fake.db.projects.filter((x) => x.id !== pid)
    for (const t of fake.db.tasks) if (t.project_id === pid) t.project_id = null
    return new HttpResponse(null, { status: 204 })
  }),

  // ── tags ─────────────────────────────────────────────────────────────────
  http.get('/api/tags', () => json(fake.tagsWithCounts())),
  http.post('/api/tags', async ({ request }) => {
    const body = (await request.json()) as Partial<Tag>
    const name = body.name!.replace(/^#/, '').toLowerCase()
    if (fake.db.tags.some((t) => t.name === name))
      return json({ detail: `Tag '${name}' already exists` }, 409)
    const tag = makeTag({ ...body, name })
    fake.db.tags.push(tag)
    return json(tag, 201)
  }),
  http.patch('/api/tags/:id', async ({ params, request }) => {
    const t = fake.db.tags.find((x) => x.id === id(params))
    if (!t) return notFound(`Tag ${params.id}`)
    Object.assign(t, await request.json())
    return json(t)
  }),
  http.delete('/api/tags/:id', ({ params }) => {
    const tid = id(params)
    fake.db.tags = fake.db.tags.filter((x) => x.id !== tid)
    for (const t of fake.db.tasks) t.tags = t.tags.filter((x) => x.id !== tid)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── stats / data ─────────────────────────────────────────────────────────
  http.get('/api/stats/overview', () => json(fake.overview())),
  http.get('/api/data/export', () =>
    json({ version: 2, exported_at: new Date().toISOString(), ...fake.db }),
  ),
  http.post('/api/data/import', async ({ request }) => {
    const body = (await request.json()) as { tasks?: unknown[] }
    return json({
      projects: 0,
      tags: 0,
      tasks: body.tasks?.length ?? 0,
      subtasks: 0,
      skipped: 0,
      warnings: [],
    })
  }),
  http.post('/api/data/import/legacy', async ({ request }) => {
    const body = (await request.json()) as { tasks?: unknown[] }
    return json({
      projects: 1,
      tags: 0,
      tasks: body.tasks?.length ?? 0,
      subtasks: 0,
      skipped: 0,
      warnings: ["Created missing project 'Ghost'"],
    })
  }),
]

export const server = setupServer(...handlers)

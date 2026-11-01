/** MSW request handlers backed by the in-memory fake API (auth + workspace aware). */
import { http, HttpResponse, type JsonBodyType } from 'msw'

type AnyResponse = HttpResponse<JsonBodyType | null>
import { setupServer } from 'msw/node'

import type {
  BulkRequest,
  Invitation,
  Project,
  Role,
  Status,
  Subtask,
  Tag,
  TaskCreate,
  TaskUpdate,
} from '@/api/types'

import { evaluatePassword } from '@/lib/password'

import * as fake from './fakeApi'
import { makeProject, makeTag } from './fixtures'

const json = (body: JsonBodyType, status = 200) => HttpResponse.json(body, { status })
const notFound = (what: string) => json({ detail: `${what} not found` }, 404)
const unauthorized = () => json({ detail: 'Not signed in' }, 401)
const forbidden = (role: Role) => json({ detail: `This action requires the ${role} role` }, 403)
const id = (params: Record<string, string | readonly string[] | undefined>, key = 'id') =>
  Number(params[key])

type Guarded = { ws: number; user: NonNullable<typeof fake.db.currentUser> }

/** Resolve the signed-in user and the requested workspace, or an error response. */
function scope(request: Request, minimum: Role = 'viewer'): Guarded | AnyResponse {
  const user = fake.db.currentUser
  if (!user) return unauthorized()
  const ws = fake.currentWorkspaceId(request)
  const role = fake.roleOf(ws, user.id)
  if (!role) return notFound(`Workspace ${ws}`)
  const rank: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 }
  if (rank[role] < rank[minimum]) return forbidden(minimum)
  return { ws, user }
}

const guard =
  <P extends Record<string, string | readonly string[] | undefined>>(
    minimum: Role,
    handler: (
      g: Guarded,
      info: { request: Request; params: P },
    ) => Promise<AnyResponse> | AnyResponse,
  ) =>
  async (info: { request: Request; params: P }) => {
    const g = scope(info.request, minimum)
    return g instanceof HttpResponse ? g : handler(g, info)
  }

export const handlers = [
  http.get('/api/health', () => json({ status: 'ok', version: 'test', database: 'memory' })),

  // ── auth ─────────────────────────────────────────────────────────────────
  http.get('/api/auth/me', () =>
    fake.db.currentUser ? json(fake.db.currentUser) : unauthorized(),
  ),
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    const user = fake.db.users.find((u) => u.email === body.email.toLowerCase())
    if (!user || body.password !== 'orbit-cactus-lantern-7')
      return json({ detail: 'Incorrect email or password' }, 401)
    fake.db.currentUser = user
    return json(user)
  }),
  http.post('/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as { email: string; display_name: string; password: string }
    if (fake.db.users.some((u) => u.email === body.email.toLowerCase()))
      return json({ detail: 'An account with this email already exists' }, 409)
    const report = evaluatePassword(body.password, {
      email: body.email,
      displayName: body.display_name,
    })
    if (report.problem) return json({ detail: report.problem }, 422)
    return json(fake.register(body), 201)
  }),
  http.post('/api/auth/logout', () => {
    fake.db.currentUser = null
    return new HttpResponse(null, { status: 204 })
  }),
  http.patch('/api/auth/me', async ({ request }) => {
    const me = fake.db.currentUser
    if (!me) return unauthorized()
    Object.assign(me, await request.json())
    return json(me)
  }),
  http.post('/api/auth/password', async ({ request }) => {
    const body = (await request.json()) as { current_password: string }
    if (body.current_password !== 'orbit-cactus-lantern-7')
      return json({ detail: 'Current password is incorrect' }, 403)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/auth/sessions', () =>
    json([
      {
        id: 1,
        created_at: '2025-01-01T00:00:00',
        last_seen_at: '2025-01-01T00:00:00',
        user_agent: 'vitest',
        is_current: true,
      },
      {
        id: 2,
        created_at: '2025-01-01T00:00:00',
        last_seen_at: '2025-01-01T00:00:00',
        user_agent: 'phone',
        is_current: false,
      },
    ]),
  ),
  http.post('/api/auth/sessions/revoke-others', () => json({ revoked: 1 })),
  http.post('/api/auth/password/check', async ({ request }) => {
    const body = (await request.json()) as {
      password: string
      email?: string
      display_name?: string
    }
    return json(
      evaluatePassword(body.password, { email: body.email, displayName: body.display_name }),
    )
  }),

  // ── workspaces ──────────────────────────────────────────────────────────
  http.get('/api/workspaces', () =>
    fake.db.currentUser ? json(fake.workspaceSummaries(fake.db.currentUser.id)) : unauthorized(),
  ),
  http.post('/api/workspaces', async ({ request }) => {
    const me = fake.db.currentUser
    if (!me) return unauthorized()
    const body = (await request.json()) as { name: string }
    const ws = fake.seedWorkspace({ name: body.name })
    return json(ws, 201)
  }),
  http.get(
    '/api/workspaces/current',
    guard('viewer', (g) => json(fake.workspaceSummaries(g.user.id).find((w) => w.id === g.ws))),
  ),
  http.patch(
    '/api/workspaces/current',
    guard('owner', async (g, { request }) => {
      const ws = fake.db.workspaces.find((w) => w.id === g.ws)!
      Object.assign(ws, await request.json())
      return json(ws)
    }),
  ),
  http.delete(
    '/api/workspaces/current',
    guard('owner', (g) => {
      const ws = fake.db.workspaces.find((w) => w.id === g.ws)!
      if (ws.is_personal) return json({ detail: 'Personal planners cannot be deleted' }, 422)
      fake.db.workspaces = fake.db.workspaces.filter((w) => w.id !== g.ws)
      fake.db.members = fake.db.members.filter((m) => m.workspace_id !== g.ws)
      return new HttpResponse(null, { status: 204 })
    }),
  ),
  http.get(
    '/api/workspaces/current/members',
    guard('viewer', (g) => json(fake.membersOf(g.ws))),
  ),
  http.patch<{ userId: string }>(
    '/api/workspaces/current/members/:userId',
    guard('owner', async (g, { request, params }) => {
      const m = fake.db.members.find(
        (x) => x.workspace_id === g.ws && x.user.id === Number(params.userId),
      )
      if (!m) return notFound('Member')
      const { role } = (await request.json()) as { role: Role }
      const owners = fake.db.members.filter((x) => x.workspace_id === g.ws && x.role === 'owner')
      if (m.role === 'owner' && role !== 'owner' && owners.length <= 1)
        return json({ detail: 'A planner needs at least one owner' }, 422)
      m.role = role
      return json(m)
    }),
  ),
  http.delete<{ userId: string }>(
    '/api/workspaces/current/members/:userId',
    guard('viewer', (g, { params }) => {
      const userId = Number(params.userId)
      const actor = fake.roleOf(g.ws, g.user.id)
      if (userId !== g.user.id && actor !== 'owner') return forbidden('owner')
      const m = fake.db.members.find((x) => x.workspace_id === g.ws && x.user.id === userId)
      if (!m) return notFound('Member')
      const owners = fake.db.members.filter((x) => x.workspace_id === g.ws && x.role === 'owner')
      if (m.role === 'owner' && owners.length <= 1)
        return json({ detail: 'Transfer ownership before leaving: a planner needs an owner' }, 422)
      fake.db.members = fake.db.members.filter((x) => x !== m)
      return new HttpResponse(null, { status: 204 })
    }),
  ),
  http.get(
    '/api/workspaces/current/invitations',
    guard('owner', (g) => json(fake.db.invitations.filter((i) => i.workspace_id === g.ws))),
  ),
  http.post(
    '/api/workspaces/current/invitations',
    guard('owner', async (g, { request }) => {
      const body = (await request.json()) as Partial<Invitation>
      return json(fake.createInvitation(g.ws, body), 201)
    }),
  ),
  http.delete<{ id: string }>(
    '/api/workspaces/current/invitations/:id',
    guard('owner', (g, { params }) => {
      const inv = fake.db.invitations.find((i) => i.id === id(params) && i.workspace_id === g.ws)
      if (!inv) return notFound('Invitation')
      inv.revoked_at = new Date().toISOString()
      inv.is_valid = false
      return new HttpResponse(null, { status: 204 })
    }),
  ),
  http.get<{ token: string }>('/api/invitations/:token', ({ params }) => {
    const inv = fake.db.invitations.find((i) => i.token === params.token)
    if (!inv) return notFound('Invitation')
    const ws = fake.db.workspaces.find((w) => w.id === inv.workspace_id)!
    return json({
      workspace_name: ws.name,
      role: inv.role,
      invited_by: 'Owner Person',
      member_count: fake.membersOf(ws.id).length,
      is_valid: inv.is_valid,
      email: inv.email,
    })
  }),
  http.post<{ token: string }>('/api/invitations/:token/accept', ({ params }) => {
    const result = fake.acceptInvitation(params.token)
    return 'error' in result ? json({ detail: result.error }, result.status) : json(result)
  }),

  // ── tasks ────────────────────────────────────────────────────────────────
  http.get(
    '/api/tasks',
    guard('viewer', (g, { request }) =>
      json(fake.listTasks(new URL(request.url).searchParams, g.ws)),
    ),
  ),
  http.get(
    '/api/tasks/upcoming',
    guard('viewer', (g, { request }) =>
      json(fake.upcoming(Number(new URL(request.url).searchParams.get('days') ?? 7), g.ws)),
    ),
  ),
  http.post(
    '/api/tasks',
    guard('editor', async (g, { request }) => {
      const body = (await request.json()) as TaskCreate
      if (!body.title?.trim())
        return json(
          { detail: [{ loc: ['body', 'title'], msg: 'String should have at least 1 character' }] },
          422,
        )
      return json(fake.createTask(body, g.ws), 201)
    }),
  ),
  http.post(
    '/api/tasks/quick-add',
    guard('editor', async (g, { request }) => {
      const body = (await request.json()) as { text: string; dry_run?: boolean }
      return json(fake.quickAdd(body.text, !!body.dry_run, g.ws), 201)
    }),
  ),
  http.post(
    '/api/tasks/bulk',
    guard('editor', async (g, { request }) =>
      json(fake.bulk((await request.json()) as BulkRequest, g.ws)),
    ),
  ),
  http.post(
    '/api/tasks/reorder',
    guard('editor', async (g, { request }) => {
      const body = (await request.json()) as { status: Status; ordered_ids: number[] }
      return json(fake.reorder(body.status, body.ordered_ids, g.ws))
    }),
  ),
  http.get<{ id: string }>(
    '/api/tasks/:id',
    guard('viewer', (g, { params }) => {
      const t = fake.getTask(id(params), g.ws)
      return t ? json(t) : notFound(`Task ${params.id}`)
    }),
  ),
  http.patch<{ id: string }>(
    '/api/tasks/:id',
    guard('editor', async (g, { params, request }) => {
      const t = fake.updateTask(id(params), (await request.json()) as TaskUpdate, g.ws)
      return t ? json(t) : notFound(`Task ${params.id}`)
    }),
  ),
  http.delete<{ id: string }>(
    '/api/tasks/:id',
    guard('editor', (g, { params }) =>
      fake.deleteTask(id(params), g.ws)
        ? new HttpResponse(null, { status: 204 })
        : notFound(`Task ${params.id}`),
    ),
  ),
  http.post<{ id: string }>(
    '/api/tasks/:id/complete',
    guard('editor', (g, { params }) => {
      const r = fake.completeTask(id(params), g.ws)
      return r ? json(r) : notFound(`Task ${params.id}`)
    }),
  ),
  http.post<{ id: string }>(
    '/api/tasks/:id/reopen',
    guard('editor', (g, { params }) => {
      const t = fake.reopenTask(id(params), g.ws)
      return t ? json(t) : notFound(`Task ${params.id}`)
    }),
  ),

  // ── comments ─────────────────────────────────────────────────────────────
  http.get<{ id: string }>(
    '/api/tasks/:id/comments',
    guard('viewer', (_g, { params }) => json(fake.commentsFor(id(params)))),
  ),
  http.post<{ id: string }>(
    '/api/tasks/:id/comments',
    guard('editor', async (g, { params, request }) => {
      const body = (await request.json()) as { body: string }
      if (!fake.getTask(id(params), g.ws)) return notFound(`Task ${params.id}`)
      return json(fake.seedComment(id(params), g.user, body.body.trim()), 201)
    }),
  ),
  http.patch<{ id: string; cid: string }>(
    '/api/tasks/:id/comments/:cid',
    guard('editor', async (g, { params, request }) => {
      const c = fake.db.comments.find((x) => x.id === id(params, 'cid'))
      if (!c) return notFound('Comment')
      if (c.author?.id !== g.user.id)
        return json({ detail: 'Only the author can edit a comment' }, 403)
      c.body = ((await request.json()) as { body: string }).body
      c.updated_at = new Date(Date.now() + 5000).toISOString()
      return json(c)
    }),
  ),
  http.delete<{ id: string; cid: string }>(
    '/api/tasks/:id/comments/:cid',
    guard('editor', (g, { params }) => {
      const c = fake.db.comments.find((x) => x.id === id(params, 'cid'))
      if (!c) return notFound('Comment')
      if (c.author?.id !== g.user.id && fake.roleOf(g.ws, g.user.id) !== 'owner')
        return json({ detail: 'Only the author or a planner owner can delete a comment' }, 403)
      fake.db.comments = fake.db.comments.filter((x) => x !== c)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // ── subtasks ─────────────────────────────────────────────────────────────
  http.post<{ id: string }>(
    '/api/tasks/:id/subtasks',
    guard('editor', async (g, { params, request }) => {
      const body = (await request.json()) as { title: string }
      if (!fake.getTask(id(params), g.ws)) return notFound(`Task ${params.id}`)
      const s = fake.addSubtask(id(params), body.title)
      return s ? json(s, 201) : notFound(`Task ${params.id}`)
    }),
  ),
  http.patch<{ id: string }>(
    '/api/subtasks/:id',
    guard('editor', async (_g, { params, request }) => {
      const s = fake.updateSubtask(id(params), (await request.json()) as Partial<Subtask>)
      return s ? json(s) : notFound(`Subtask ${params.id}`)
    }),
  ),
  http.delete<{ id: string }>(
    '/api/subtasks/:id',
    guard('editor', (_g, { params }) =>
      fake.deleteSubtask(id(params))
        ? new HttpResponse(null, { status: 204 })
        : notFound(`Subtask ${params.id}`),
    ),
  ),

  // ── projects ─────────────────────────────────────────────────────────────
  http.get(
    '/api/projects',
    guard('viewer', (g, { request }) =>
      json(
        fake.projectsWithStats(
          new URL(request.url).searchParams.get('include_archived') !== 'false',
          g.ws,
        ),
      ),
    ),
  ),
  http.post(
    '/api/projects',
    guard('editor', async (g, { request }) => {
      const body = (await request.json()) as Partial<Project>
      if (
        fake.db.projects.some(
          (p) => p.workspace_id === g.ws && p.name.toLowerCase() === body.name?.toLowerCase(),
        )
      )
        return json({ detail: `Project '${body.name}' already exists` }, 409)
      const p = makeProject(body)
      fake.db.projects.push({ ...p, workspace_id: g.ws })
      return json(p, 201)
    }),
  ),
  http.get<{ id: string }>(
    '/api/projects/:id',
    guard('viewer', (g, { params }) => {
      const p = fake.db.projects.find((x) => x.id === id(params) && x.workspace_id === g.ws)
      return p ? json(p) : notFound(`Project ${params.id}`)
    }),
  ),
  http.patch<{ id: string }>(
    '/api/projects/:id',
    guard('editor', async (g, { params, request }) => {
      const p = fake.db.projects.find((x) => x.id === id(params) && x.workspace_id === g.ws)
      if (!p) return notFound(`Project ${params.id}`)
      Object.assign(p, await request.json())
      return json(p)
    }),
  ),
  http.delete<{ id: string }>(
    '/api/projects/:id',
    guard('editor', (g, { params }) => {
      const pid = id(params)
      if (!fake.db.projects.some((x) => x.id === pid && x.workspace_id === g.ws))
        return notFound(`Project ${params.id}`)
      fake.db.projects = fake.db.projects.filter((x) => x.id !== pid)
      for (const t of fake.db.tasks) if (t.project_id === pid) t.project_id = null
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // ── tags ─────────────────────────────────────────────────────────────────
  http.get(
    '/api/tags',
    guard('viewer', (g) => json(fake.tagsWithCounts(g.ws))),
  ),
  http.post(
    '/api/tags',
    guard('editor', async (g, { request }) => {
      const body = (await request.json()) as Partial<Tag>
      const name = body.name!.replace(/^#/, '').toLowerCase()
      if (fake.db.tags.some((t) => t.workspace_id === g.ws && t.name === name))
        return json({ detail: `Tag '${name}' already exists` }, 409)
      const tag = makeTag({ ...body, name })
      fake.db.tags.push({ ...tag, workspace_id: g.ws })
      return json(tag, 201)
    }),
  ),
  http.patch<{ id: string }>(
    '/api/tags/:id',
    guard('editor', async (g, { params, request }) => {
      const t = fake.db.tags.find((x) => x.id === id(params) && x.workspace_id === g.ws)
      if (!t) return notFound(`Tag ${params.id}`)
      Object.assign(t, await request.json())
      return json(t)
    }),
  ),
  http.delete<{ id: string }>(
    '/api/tags/:id',
    guard('editor', (g, { params }) => {
      const tid = id(params)
      fake.db.tags = fake.db.tags.filter((x) => !(x.id === tid && x.workspace_id === g.ws))
      for (const t of fake.db.tasks) t.tags = t.tags.filter((x) => x.id !== tid)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // ── stats / data ─────────────────────────────────────────────────────────
  http.get(
    '/api/stats/overview',
    guard('viewer', (g) => json(fake.overview(g.ws))),
  ),
  http.get(
    '/api/data/export',
    guard('viewer', (g) =>
      json({
        version: 2,
        exported_at: new Date().toISOString(),
        tasks: fake.db.tasks.filter((t) => t.workspace_id === g.ws),
        projects: fake.db.projects.filter((p) => p.workspace_id === g.ws),
        tags: fake.db.tags.filter((t) => t.workspace_id === g.ws),
      }),
    ),
  ),
  http.post(
    '/api/data/import',
    guard('editor', async (_g, { request }) => {
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
  ),
  http.post(
    '/api/data/import/legacy',
    guard('editor', async (_g, { request }) => {
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
  ),
]

export const server = setupServer(...handlers)

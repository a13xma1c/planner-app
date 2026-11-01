/**
 * A small in-memory re-implementation of the backend used by MSW handlers.
 * It mirrors the server's semantics closely enough for realistic component tests
 * (filtering, completion with recurrence, bulk ops, stats) without a network.
 */
import type {
  BulkRequest,
  Overview,
  Priority,
  Project,
  ProjectWithStats,
  QuickAddResult,
  Status,
  Subtask,
  Tag,
  TagWithCount,
  Task,
  TaskCreate,
  TaskUpdate,
} from '@/api/types'

import { makeProject, makeSubtask, makeTag, makeTask, nextId } from './fixtures'

export interface Db {
  tasks: Task[]
  projects: Project[]
  tags: Tag[]
}

export const db: Db = { tasks: [], projects: [], tags: [] }

export function resetDb(): void {
  db.tasks = []
  db.projects = []
  db.tags = []
}

export const todayISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

function ensureTag(name: string): Tag {
  const norm = name.replace(/^#/, '').toLowerCase()
  let tag = db.tags.find((t) => t.name === norm)
  if (!tag) {
    tag = makeTag({ name: norm })
    db.tags.push(tag)
  }
  return tag
}

function hydrate(task: Task): Task {
  const project = db.projects.find((p) => p.id === task.project_id) ?? null
  const is_overdue = task.status !== 'done' && !!task.due_date && task.due_date < todayISO()
  return { ...task, project, project_id: project?.id ?? null, is_overdue }
}

export function seedProject(overrides: Partial<Project> = {}): Project {
  const p = makeProject(overrides)
  db.projects.push(p)
  return p
}

export function seedTask(overrides: Partial<Task> & { tagNames?: string[] } = {}): Task {
  const { tagNames, ...rest } = overrides
  const t = makeTask(rest)
  if (tagNames) t.tags = tagNames.map(ensureTag)
  db.tasks.push(t)
  return hydrate(t)
}

export function getTask(id: number): Task | undefined {
  const t = db.tasks.find((x) => x.id === id)
  return t && hydrate(t)
}

export function createTask(body: TaskCreate): Task {
  const id = nextId()
  const task = makeTask({
    id,
    title: body.title.trim(),
    notes: body.notes ?? '',
    project_id: body.project_id ?? null,
    priority: body.priority ?? 'medium',
    status: body.status ?? 'todo',
    due_date: body.due_date ?? null,
    recurrence: body.recurrence ?? null,
    estimate_minutes: body.estimate_minutes ?? null,
    position: db.tasks.length,
    tags: (body.tags ?? []).map(ensureTag),
    subtasks: (body.subtasks ?? []).map((title, i) => makeSubtask(id, { title, position: i })),
  })
  if (task.status === 'done') task.completed_at = new Date().toISOString()
  db.tasks.push(task)
  return hydrate(task)
}

export function updateTask(id: number, body: TaskUpdate): Task | undefined {
  const task = db.tasks.find((t) => t.id === id)
  if (!task) return undefined
  const { tags, ...rest } = body
  Object.assign(task, rest)
  if (body.status !== undefined)
    task.completed_at = body.status === 'done' ? new Date().toISOString() : null
  if (tags) task.tags = tags.map(ensureTag)
  task.updated_at = new Date().toISOString()
  return hydrate(task)
}

export function deleteTask(id: number): boolean {
  const before = db.tasks.length
  db.tasks = db.tasks.filter((t) => t.id !== id)
  return db.tasks.length < before
}

export function completeTask(id: number): { task: Task; next_task: Task | null } | undefined {
  const task = db.tasks.find((t) => t.id === id)
  if (!task) return undefined
  if (task.status === 'done') return { task: hydrate(task), next_task: null }
  task.status = 'done'
  task.completed_at = new Date().toISOString()
  let next: Task | null = null
  if (task.recurrence) {
    const d = new Date(task.due_date ?? todayISO())
    d.setDate(d.getDate() + (task.recurrence === 'weekly' ? 7 : 1))
    next = createTask({
      title: task.title,
      project_id: task.project_id,
      priority: task.priority,
      due_date: d.toISOString().slice(0, 10),
      recurrence: task.recurrence,
      tags: task.tags.map((t) => t.name),
    })
    task.recurrence = null
  }
  return { task: hydrate(task), next_task: next }
}

export function reopenTask(id: number): Task | undefined {
  const task = db.tasks.find((t) => t.id === id)
  if (!task) return undefined
  task.status = 'todo'
  task.completed_at = null
  return hydrate(task)
}

export function listTasks(params: URLSearchParams): Task[] {
  let rows = db.tasks.map(hydrate)
  const today = todayISO()
  if (params.get('inbox') === 'true') rows = rows.filter((t) => t.project_id === null)
  else if (params.get('project_id'))
    rows = rows.filter((t) => t.project_id === Number(params.get('project_id')))
  const statuses = params.getAll('status') as Status[]
  if (statuses.length) rows = rows.filter((t) => statuses.includes(t.status))
  else if (params.get('include_done') === 'false') rows = rows.filter((t) => t.status !== 'done')
  const priorities = params.getAll('priority') as Priority[]
  if (priorities.length) rows = rows.filter((t) => priorities.includes(t.priority))
  for (const tag of params.getAll('tag'))
    rows = rows.filter((t) => t.tags.some((x) => x.name === tag))
  const search = params.get('search')?.toLowerCase()
  if (search)
    rows = rows.filter(
      (t) => t.title.toLowerCase().includes(search) || t.notes.toLowerCase().includes(search),
    )
  const from = params.get('due_from')
  const to = params.get('due_to')
  if (from) rows = rows.filter((t) => t.due_date !== null && t.due_date >= from)
  if (to) rows = rows.filter((t) => t.due_date !== null && t.due_date <= to)
  if (params.get('overdue') === 'true') rows = rows.filter((t) => t.is_overdue)
  const sort = params.get('sort') ?? 'smart'
  const dir = params.get('order') === 'desc' ? -1 : 1
  const cmp: Record<string, (a: Task, b: Task) => number> = {
    smart: (a, b) =>
      Number(a.status === 'done') - Number(b.status === 'done') ||
      Number(b.is_overdue) - Number(a.is_overdue) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      a.id - b.id,
    due_date: (a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.id - b.id,
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.id - b.id,
    created: (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
    updated: (a, b) => a.updated_at.localeCompare(b.updated_at) || a.id - b.id,
    title: (a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id - b.id,
    position: (a, b) => a.position - b.position || a.id - b.id,
  }
  rows.sort((a, b) => (cmp[sort] ?? cmp.smart!)(a, b) * (sort === 'smart' ? 1 : dir))
  const limit = params.get('limit')
  if (limit) rows = rows.slice(0, Number(limit))
  void today
  return rows
}

export function upcoming(days: number): Task[] {
  const today = todayISO()
  const end = new Date()
  end.setDate(end.getDate() + days)
  const endISO = end.toISOString().slice(0, 10)
  return db.tasks
    .map(hydrate)
    .filter((t) => t.status !== 'done' && t.due_date && t.due_date >= today && t.due_date <= endISO)
}

export function quickAdd(text: string, dryRun: boolean): QuickAddResult {
  // Deliberately simple: "#tag", "@Project", "!high", "tomorrow"
  const tags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase())
  const projectName = /@(\w+)/.exec(text)?.[1] ?? null
  const priority = (/!(urgent|high|medium|low)/.exec(text)?.[1] as Priority | undefined) ?? 'medium'
  let due_date: string | null = null
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    due_date = d.toISOString().slice(0, 10)
  } else if (/\btoday\b/i.test(text)) due_date = todayISO()
  const title = text
    .replace(/#\w+|@\w+|!\w+|\btomorrow\b|\btoday\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const project = projectName
    ? db.projects.find((p) => p.name.toLowerCase() === projectName.toLowerCase())
    : undefined
  const warnings: string[] = []
  if (projectName && !project)
    warnings.push(`Project '${projectName}' not found; task will go to the Inbox.`)
  const preview = {
    title,
    project_name: project?.name ?? null,
    project_id: project?.id ?? null,
    priority,
    due_date,
    recurrence: null,
    tags,
    estimate_minutes: null,
    warnings,
  }
  if (dryRun) return { preview, task: null }
  const task = createTask({ title, project_id: preview.project_id, priority, due_date, tags })
  return { preview, task }
}

export function bulk(req: BulkRequest): { affected: number; tasks: Task[] } {
  const rows = db.tasks.filter((t) => req.ids.includes(t.id))
  if (req.action === 'delete') {
    db.tasks = db.tasks.filter((t) => !req.ids.includes(t.id))
    return { affected: rows.length, tasks: [] }
  }
  for (const t of rows) {
    switch (req.action) {
      case 'complete':
        t.status = 'done'
        t.completed_at = new Date().toISOString()
        break
      case 'reopen':
        t.status = 'todo'
        t.completed_at = null
        break
      case 'set_status':
        t.status = req.status!
        break
      case 'set_priority':
        t.priority = req.priority!
        break
      case 'move_to_project':
        t.project_id = req.project_id ?? null
        break
      case 'set_due_date':
        t.due_date = req.due_date ?? null
        break
      case 'add_tag': {
        const tag = ensureTag(req.tag!)
        if (!t.tags.some((x) => x.id === tag.id)) t.tags.push(tag)
        break
      }
    }
  }
  return { affected: rows.length, tasks: rows.map(hydrate) }
}

export function reorder(status: Status, ids: number[]): Task[] {
  return ids.map((id, i) => {
    const t = db.tasks.find((x) => x.id === id)!
    t.status = status
    t.position = i
    return hydrate(t)
  })
}

export function addSubtask(taskId: number, title: string): Subtask | undefined {
  const t = db.tasks.find((x) => x.id === taskId)
  if (!t) return undefined
  const sub = makeSubtask(taskId, { title, position: t.subtasks.length })
  t.subtasks.push(sub)
  return sub
}

export function updateSubtask(id: number, data: Partial<Subtask>): Subtask | undefined {
  for (const t of db.tasks) {
    const s = t.subtasks.find((x) => x.id === id)
    if (s) {
      Object.assign(s, data)
      return s
    }
  }
  return undefined
}

export function deleteSubtask(id: number): boolean {
  for (const t of db.tasks) {
    const before = t.subtasks.length
    t.subtasks = t.subtasks.filter((x) => x.id !== id)
    if (t.subtasks.length < before) return true
  }
  return false
}

export function projectsWithStats(includeArchived: boolean): ProjectWithStats[] {
  return db.projects
    .filter((p) => includeArchived || !p.is_archived)
    .map((p) => {
      const tasks = db.tasks.filter((t) => t.project_id === p.id).map(hydrate)
      const stats: ProjectWithStats = Object.assign({}, p, {
        task_count: tasks.length,
        done_count: tasks.filter((t) => t.status === 'done').length,
        overdue_count: tasks.filter((t) => t.is_overdue).length,
      })
      return stats
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function tagsWithCounts(): TagWithCount[] {
  return db.tags
    .map((tag) => ({
      ...tag,
      task_count: db.tasks.filter((t) => t.tags.some((x) => x.id === tag.id)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function overview(): Overview {
  const today = todayISO()
  const tasks = db.tasks.map(hydrate)
  const done = tasks.filter((t) => t.status === 'done')
  const open = tasks.filter((t) => t.status !== 'done')
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  })
  const projects = [
    ...(tasks.some((t) => t.project_id === null)
      ? [
          {
            id: null,
            name: 'Inbox',
            color: '#94a3b8',
            total: tasks.filter((t) => !t.project_id).length,
            done: done.filter((t) => !t.project_id).length,
          },
        ]
      : []),
    ...db.projects
      .filter((p) => !p.is_archived)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        total: tasks.filter((t) => t.project_id === p.id).length,
        done: done.filter((t) => t.project_id === p.id).length,
      })),
  ]
  return {
    total: tasks.length,
    open: open.length,
    by_status: {
      todo: tasks.filter((t) => t.status === 'todo').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      done: done.length,
    },
    by_priority: {
      urgent: open.filter((t) => t.priority === 'urgent').length,
      high: open.filter((t) => t.priority === 'high').length,
      medium: open.filter((t) => t.priority === 'medium').length,
      low: open.filter((t) => t.priority === 'low').length,
    },
    overdue: open.filter((t) => t.is_overdue).length,
    due_today: open.filter((t) => t.due_date === today).length,
    due_this_week: open.filter((t) => t.due_date && t.due_date >= today).length,
    completed_today: done.filter((t) => t.completed_at?.slice(0, 10) === today).length,
    completed_last_7_days: done.length,
    completion_rate: tasks.length ? done.length / tasks.length : 0,
    completed_series: days.map((day) => ({
      day,
      count: done.filter((t) => t.completed_at?.slice(0, 10) === day).length,
    })),
    created_series: days.map((day) => ({
      day,
      count: tasks.filter((t) => t.created_at.slice(0, 10) === day).length,
    })),
    projects,
    streak_days: done.some((t) => t.completed_at?.slice(0, 10) === today) ? 1 : 0,
  }
}

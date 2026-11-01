import type { Overview, Project, Subtask, Tag, Task } from '@/api/types'

let seq = 1000
export const nextId = () => ++seq

const NOW = '2025-03-12T09:00:00'

export function makeProject(overrides: Partial<Project> = {}): Project {
  const id = overrides.id ?? nextId()
  return {
    id,
    name: `Project ${id}`,
    description: '',
    color: '#6366f1',
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  const id = overrides.id ?? nextId()
  return { id, name: `tag${id}`, color: '#64748b', ...overrides }
}

export function makeSubtask(taskId: number, overrides: Partial<Subtask> = {}): Subtask {
  const id = overrides.id ?? nextId()
  return { id, task_id: taskId, title: `Step ${id}`, is_done: false, position: 0, ...overrides }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? nextId()
  return {
    id,
    title: `Task ${id}`,
    notes: '',
    project_id: null,
    project: null,
    priority: 'medium',
    status: 'todo',
    due_date: null,
    recurrence: null,
    estimate_minutes: null,
    position: 0,
    completed_at: null,
    created_at: NOW,
    updated_at: NOW,
    tags: [],
    subtasks: [],
    is_overdue: false,
    ...overrides,
  }
}

export function makeOverview(overrides: Partial<Overview> = {}): Overview {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  })
  return {
    total: 0,
    open: 0,
    by_status: { todo: 0, in_progress: 0, done: 0 },
    by_priority: { low: 0, medium: 0, high: 0, urgent: 0 },
    overdue: 0,
    due_today: 0,
    due_this_week: 0,
    completed_today: 0,
    completed_last_7_days: 0,
    completion_rate: 0,
    completed_series: days.map((day) => ({ day, count: 0 })),
    created_series: days.map((day) => ({ day, count: 0 })),
    projects: [],
    streak_days: 0,
    ...overrides,
  }
}

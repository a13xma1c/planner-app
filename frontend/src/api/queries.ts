/**
 * TanStack Query hooks. Server state lives here; components never call fetch directly.
 * Mutations invalidate coarse-grained keys so every view stays consistent.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'

import { api } from './client'
import type {
  BulkRequest,
  BulkResult,
  CompleteResult,
  Health,
  ImportResult,
  Overview,
  Project,
  ProjectWithStats,
  QuickAddResult,
  Status,
  Subtask,
  Tag,
  TagWithCount,
  Task,
  TaskCreate,
  TaskFilters,
  TaskUpdate,
} from './types'

export const keys = {
  tasks: ['tasks'] as const,
  taskList: (filters: TaskFilters) => ['tasks', 'list', filters] as const,
  task: (id: number) => ['tasks', 'detail', id] as const,
  upcoming: (days: number) => ['tasks', 'upcoming', days] as const,
  projects: ['projects'] as const,
  tags: ['tags'] as const,
  stats: ['stats'] as const,
  health: ['health'] as const,
}

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
>

function useInvalidate() {
  const qc = useQueryClient()
  return {
    all: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.tasks }),
        qc.invalidateQueries({ queryKey: keys.projects }),
        qc.invalidateQueries({ queryKey: keys.tags }),
        qc.invalidateQueries({ queryKey: keys.stats }),
      ]),
    tasks: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.tasks }),
        qc.invalidateQueries({ queryKey: keys.projects }),
        qc.invalidateQueries({ queryKey: keys.tags }),
        qc.invalidateQueries({ queryKey: keys.stats }),
      ]),
    projects: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.projects }),
        qc.invalidateQueries({ queryKey: keys.tasks }),
        qc.invalidateQueries({ queryKey: keys.stats }),
      ]),
    tags: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.tags }),
        qc.invalidateQueries({ queryKey: keys.tasks }),
      ]),
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────

export function useTasks(filters: TaskFilters = {}, enabled = true) {
  return useQuery({
    queryKey: keys.taskList(filters),
    queryFn: ({ signal }) => api.get<Task[]>('/api/tasks', { ...filters }, signal),
    enabled,
  })
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: keys.task(id ?? -1),
    queryFn: ({ signal }) => api.get<Task>(`/api/tasks/${id}`, undefined, signal),
    enabled: id !== null,
  })
}

export function useUpcoming(days = 7) {
  return useQuery({
    queryKey: keys.upcoming(days),
    queryFn: ({ signal }) => api.get<Task[]>('/api/tasks/upcoming', { days }, signal),
  })
}

export function useCreateTask(opts?: MutationOpts<Task, TaskCreate>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: TaskCreate) => api.post<Task>('/api/tasks', body),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useUpdateTask(opts?: MutationOpts<Task, { id: number; data: TaskUpdate }>) {
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => api.patch<Task>(`/api/tasks/${id}`, data),
    ...opts,
    onSuccess: async (task, ...rest) => {
      qc.setQueryData(keys.task(task.id), task)
      await inv.tasks()
      await opts?.onSuccess?.(task, ...rest)
    },
  })
}

export function useDeleteTask(opts?: MutationOpts<void, number>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/tasks/${id}`),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useCompleteTask(opts?: MutationOpts<CompleteResult, number>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => api.post<CompleteResult>(`/api/tasks/${id}/complete`),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useReopenTask(opts?: MutationOpts<Task, number>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => api.post<Task>(`/api/tasks/${id}/reopen`),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useQuickAdd(
  opts?: MutationOpts<QuickAddResult, { text: string; dry_run?: boolean }>,
) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => api.post<QuickAddResult>('/api/tasks/quick-add', body),
    ...opts,
    onSuccess: async (result, vars, ...rest) => {
      if (!vars.dry_run) await inv.tasks()
      await opts?.onSuccess?.(result, vars, ...rest)
    },
  })
}

export function useBulk(opts?: MutationOpts<BulkResult, BulkRequest>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: BulkRequest) => api.post<BulkResult>('/api/tasks/bulk', body),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useReorder(opts?: MutationOpts<Task[], { status: Status; ordered_ids: number[] }>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => api.post<Task[]>('/api/tasks/reorder', body),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

// ── Subtasks ──────────────────────────────────────────────────────────────

export function useAddSubtask(opts?: MutationOpts<Subtask, { taskId: number; title: string }>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ taskId, title }) =>
      api.post<Subtask>(`/api/tasks/${taskId}/subtasks`, { title }),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useUpdateSubtask(
  opts?: MutationOpts<
    Subtask,
    { id: number; data: Partial<Pick<Subtask, 'title' | 'is_done' | 'position'>> }
  >,
) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => api.patch<Subtask>(`/api/subtasks/${id}`, data),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useDeleteSubtask(opts?: MutationOpts<void, number>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/subtasks/${id}`),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tasks()
      await opts?.onSuccess?.(...args)
    },
  })
}

// ── Projects ──────────────────────────────────────────────────────────────

export function useProjects(includeArchived = true) {
  return useQuery({
    queryKey: [...keys.projects, { includeArchived }],
    queryFn: ({ signal }) =>
      api.get<ProjectWithStats[]>('/api/projects', { include_archived: includeArchived }, signal),
  })
}

export type ProjectInput = { name: string; description?: string; color?: string }

export function useCreateProject(opts?: MutationOpts<Project, ProjectInput>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => api.post<Project>('/api/projects', body),
    ...opts,
    onSuccess: async (...args) => {
      await inv.projects()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useUpdateProject(
  opts?: MutationOpts<
    Project,
    { id: number; data: Partial<ProjectInput> & { is_archived?: boolean } }
  >,
) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => api.patch<Project>(`/api/projects/${id}`, data),
    ...opts,
    onSuccess: async (...args) => {
      await inv.projects()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useDeleteProject(opts?: MutationOpts<void, number>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/projects/${id}`),
    ...opts,
    onSuccess: async (...args) => {
      await inv.projects()
      await opts?.onSuccess?.(...args)
    },
  })
}

// ── Tags ──────────────────────────────────────────────────────────────────

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: ({ signal }) => api.get<TagWithCount[]>('/api/tags', undefined, signal),
  })
}

export function useCreateTag(opts?: MutationOpts<Tag, { name: string; color?: string }>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => api.post<Tag>('/api/tags', body),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tags()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useUpdateTag(
  opts?: MutationOpts<Tag, { id: number; data: { name?: string; color?: string } }>,
) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => api.patch<Tag>(`/api/tags/${id}`, data),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tags()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useDeleteTag(opts?: MutationOpts<void, number>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/tags/${id}`),
    ...opts,
    onSuccess: async (...args) => {
      await inv.tags()
      await opts?.onSuccess?.(...args)
    },
  })
}

// ── Stats / data / meta ───────────────────────────────────────────────────

export function useOverview() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: ({ signal }) => api.get<Overview>('/api/stats/overview', undefined, signal),
  })
}

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: ({ signal }) => api.get<Health>('/api/health', undefined, signal),
    staleTime: Infinity,
  })
}

export function useImportBundle(
  opts?: MutationOpts<ImportResult, { bundle: unknown; replace: boolean }>,
) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ bundle, replace }) =>
      api.post<ImportResult>('/api/data/import', bundle, { replace }),
    ...opts,
    onSuccess: async (...args) => {
      await inv.all()
      await opts?.onSuccess?.(...args)
    },
  })
}

export function useImportLegacy(opts?: MutationOpts<ImportResult, unknown>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (payload: unknown) => api.post<ImportResult>('/api/data/import/legacy', payload),
    ...opts,
    onSuccess: async (...args) => {
      await inv.all()
      await opts?.onSuccess?.(...args)
    },
  })
}

export async function downloadExport(): Promise<void> {
  const bundle = await api.get<unknown>('/api/data/export')
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `planner-export-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

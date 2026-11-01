/**
 * TanStack Query hooks. Server state lives here; components never call fetch directly.
 * Every workspace-scoped key starts with the workspace id so switching planners never
 * shows stale data, and mutations invalidate coarse-grained keys.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'

import { useWorkspaceId } from '@/lib/workspaceContext'

import { api, scoped } from './client'
import type {
  BulkRequest,
  BulkResult,
  Comment,
  CompleteResult,
  Health,
  ImportResult,
  Invitation,
  InvitationPreview,
  Member,
  Overview,
  Project,
  ProjectWithStats,
  QuickAddResult,
  Role,
  SessionInfo,
  Status,
  Subtask,
  Tag,
  TagWithCount,
  Task,
  TaskCreate,
  TaskFilters,
  TaskUpdate,
  User,
  WorkspaceSummary,
} from './types'

export const keys = {
  me: ['me'] as const,
  sessions: ['me', 'sessions'] as const,
  workspaces: ['workspaces'] as const,
  invitationPreview: (token: string) => ['invitation', token] as const,
  health: ['health'] as const,
  // workspace-scoped
  ws: (wid: number) => [wid] as const,
  tasks: (wid: number) => [wid, 'tasks'] as const,
  taskList: (wid: number, filters: TaskFilters) => [wid, 'tasks', 'list', filters] as const,
  task: (wid: number, id: number) => [wid, 'tasks', 'detail', id] as const,
  upcoming: (wid: number, days: number) => [wid, 'tasks', 'upcoming', days] as const,
  comments: (wid: number, taskId: number) => [wid, 'comments', taskId] as const,
  projects: (wid: number) => [wid, 'projects'] as const,
  tags: (wid: number) => [wid, 'tags'] as const,
  stats: (wid: number) => [wid, 'stats'] as const,
  members: (wid: number) => [wid, 'members'] as const,
  invitations: (wid: number) => [wid, 'invitations'] as const,
}

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
>

function useWs() {
  const wid = useWorkspaceId()
  if (wid === null) throw new Error('This hook needs an active workspace')
  return { wid, api: scoped(wid) }
}

function useInvalidate() {
  const qc = useQueryClient()
  const wid = useWorkspaceId()
  const inv = (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key })
  return {
    /** Everything in the current workspace (tasks, projects, tags, stats, members…). */
    workspace: () => (wid === null ? Promise.resolve() : inv(keys.ws(wid))),
    /** Task-derived data: tasks + projects/tags counts + stats. */
    tasks: () =>
      wid === null
        ? Promise.resolve()
        : Promise.all([
            inv(keys.tasks(wid)),
            inv(keys.projects(wid)),
            inv(keys.tags(wid)),
            inv(keys.stats(wid)),
          ]),
    projects: () =>
      wid === null
        ? Promise.resolve()
        : Promise.all([inv(keys.projects(wid)), inv(keys.tasks(wid)), inv(keys.stats(wid))]),
    tags: () =>
      wid === null ? Promise.resolve() : Promise.all([inv(keys.tags(wid)), inv(keys.tasks(wid))]),
    members: () =>
      Promise.all([
        inv(keys.workspaces),
        ...(wid === null ? [] : [inv(keys.members(wid)), inv(keys.stats(wid))]),
      ]),
    workspaces: () => inv(keys.workspaces),
  }
}

/** Wrap user-supplied onSuccess so invalidation always runs first. */
function withInvalidate<TData, TVariables>(
  opts: MutationOpts<TData, TVariables> | undefined,
  invalidate: (data: TData, vars: TVariables) => Promise<unknown>,
): MutationOpts<TData, TVariables> {
  return {
    ...opts,
    onSuccess: async (data, vars, ...rest) => {
      await invalidate(data, vars)
      await opts?.onSuccess?.(data, vars, ...rest)
    },
  }
}

// ── Auth / account ────────────────────────────────────────────────────────

export type AuthError = Error & { status?: number }

export function useMe(enabled = true) {
  return useQuery({
    queryKey: keys.me,
    queryFn: ({ signal }) => api.get<User>('/api/auth/me', undefined, signal),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useLogin(opts?: MutationOpts<User, { email: string; password: string }>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post<User>('/api/auth/login', body),
    ...withInvalidate(opts, async (user) => {
      qc.clear()
      qc.setQueryData(keys.me, user)
    }),
  })
}

export function useRegister(
  opts?: MutationOpts<User, { email: string; password: string; display_name: string }>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post<User>('/api/auth/register', body),
    ...withInvalidate(opts, async (user) => {
      qc.clear()
      qc.setQueryData(keys.me, user)
    }),
  })
}

export function useLogout(opts?: MutationOpts<void, void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>('/api/auth/logout'),
    ...withInvalidate(opts, async () => {
      qc.clear()
    }),
  })
}

export function useUpdateProfile(opts?: MutationOpts<User, { display_name: string }>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.patch<User>('/api/auth/me', body),
    ...withInvalidate(opts, async (user) => {
      qc.setQueryData(keys.me, user)
      await qc.invalidateQueries({ queryKey: keys.workspaces })
    }),
  })
}

export function useChangePassword(
  opts?: MutationOpts<void, { current_password: string; new_password: string }>,
) {
  return useMutation({ mutationFn: (body) => api.post<void>('/api/auth/password', body), ...opts })
}

export function useSessions() {
  return useQuery({
    queryKey: keys.sessions,
    queryFn: ({ signal }) => api.get<SessionInfo[]>('/api/auth/sessions', undefined, signal),
  })
}

export function useRevokeOtherSessions(opts?: MutationOpts<{ revoked: number }, void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/api/auth/sessions/revoke-others'),
    ...withInvalidate(opts, () => qc.invalidateQueries({ queryKey: keys.sessions })),
  })
}

// ── Workspaces ────────────────────────────────────────────────────────────

export function useWorkspaces(enabled = true) {
  return useQuery({
    queryKey: keys.workspaces,
    queryFn: ({ signal }) => api.get<WorkspaceSummary[]>('/api/workspaces', undefined, signal),
    enabled,
  })
}

export function useCreateWorkspace(opts?: MutationOpts<WorkspaceSummary, { name: string }>) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => api.post<WorkspaceSummary>('/api/workspaces', body),
    ...withInvalidate(opts, () => inv.workspaces()),
  })
}

export function useUpdateWorkspace(opts?: MutationOpts<WorkspaceSummary, { name: string }>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => ws.patch<WorkspaceSummary>('/api/workspaces/current', body),
    ...withInvalidate(opts, () => inv.workspaces()),
  })
}

export function useDeleteWorkspace(opts?: MutationOpts<void, void>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: () => ws.delete('/api/workspaces/current'),
    ...withInvalidate(opts, () => inv.workspaces()),
  })
}

export function useMembers() {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.members(wid),
    queryFn: ({ signal }) => ws.get<Member[]>('/api/workspaces/current/members', undefined, signal),
  })
}

export function useUpdateMember(opts?: MutationOpts<Member, { userId: number; role: Role }>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ userId, role }) =>
      ws.patch<Member>(`/api/workspaces/current/members/${userId}`, { role }),
    ...withInvalidate(opts, () => inv.members()),
  })
}

export function useRemoveMember(opts?: MutationOpts<void, number>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (userId: number) => ws.delete(`/api/workspaces/current/members/${userId}`),
    ...withInvalidate(opts, () => inv.members()),
  })
}

export function useInvitations(enabled = true) {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.invitations(wid),
    queryFn: ({ signal }) =>
      ws.get<Invitation[]>('/api/workspaces/current/invitations', undefined, signal),
    enabled,
  })
}

export type InvitationInput = {
  role: Role
  email?: string | null
  expires_in_days?: number
  max_uses?: number | null
}

export function useCreateInvitation(opts?: MutationOpts<Invitation, InvitationInput>) {
  const { wid, api: ws } = useWs()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => ws.post<Invitation>('/api/workspaces/current/invitations', body),
    ...withInvalidate(opts, () => qc.invalidateQueries({ queryKey: keys.invitations(wid) })),
  })
}

export function useRevokeInvitation(opts?: MutationOpts<void, number>) {
  const { wid, api: ws } = useWs()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ws.delete(`/api/workspaces/current/invitations/${id}`),
    ...withInvalidate(opts, () => qc.invalidateQueries({ queryKey: keys.invitations(wid) })),
  })
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: keys.invitationPreview(token),
    queryFn: ({ signal }) =>
      api.get<InvitationPreview>(`/api/invitations/${token}`, undefined, signal),
    retry: false,
  })
}

export function useAcceptInvitation(opts?: MutationOpts<WorkspaceSummary, string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => api.post<WorkspaceSummary>(`/api/invitations/${token}/accept`),
    ...withInvalidate(opts, () => qc.invalidateQueries({ queryKey: keys.workspaces })),
  })
}

// ── Tasks ─────────────────────────────────────────────────────────────────

type Snapshot = [readonly unknown[], unknown][]

/**
 * Optimistically apply `patch` to a task everywhere it is cached (lists, detail) and
 * return a snapshot for rollback. Lists keep their order; invalidation re-sorts later.
 */
function patchCachedTask(
  qc: ReturnType<typeof useQueryClient>,
  wid: number,
  id: number,
  patch: Partial<Task>,
): Snapshot {
  const snapshot: Snapshot = qc.getQueriesData<Task[] | Task>({ queryKey: keys.tasks(wid) })
  qc.setQueriesData<Task[] | Task>({ queryKey: keys.tasks(wid) }, (data) => {
    if (Array.isArray(data)) return data.map((t) => (t.id === id ? { ...t, ...patch } : t))
    if (data && typeof data === 'object' && 'id' in data && data.id === id)
      return { ...data, ...patch }
    return data
  })
  return snapshot
}

function restoreSnapshot(qc: ReturnType<typeof useQueryClient>, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data)
}

export function useTasks(filters: TaskFilters = {}, enabled = true) {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.taskList(wid, filters),
    queryFn: ({ signal }) => ws.get<Task[]>('/api/tasks', { ...filters }, signal),
    enabled,
  })
}

export function useTask(id: number | null) {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.task(wid, id ?? -1),
    queryFn: ({ signal }) => ws.get<Task>(`/api/tasks/${id}`, undefined, signal),
    enabled: id !== null,
  })
}

export function useUpcoming(days = 7) {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.upcoming(wid, days),
    queryFn: ({ signal }) => ws.get<Task[]>('/api/tasks/upcoming', { days }, signal),
  })
}

export function useCreateTask(opts?: MutationOpts<Task, TaskCreate>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: TaskCreate) => ws.post<Task>('/api/tasks', body),
    ...withInvalidate(opts, () => inv.tasks()),
  })
}

export function useUpdateTask(opts?: MutationOpts<Task, { id: number; data: TaskUpdate }>) {
  const { wid, api: ws } = useWs()
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => ws.patch<Task>(`/api/tasks/${id}`, data),
    ...withInvalidate(opts, (task) => {
      qc.setQueryData(keys.task(wid, task.id), task)
      return inv.tasks()
    }),
  })
}

export function useDeleteTask(opts?: MutationOpts<void, number>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ws.delete(`/api/tasks/${id}`),
    ...withInvalidate(opts, () => inv.tasks()),
  })
}

export function useCompleteTask(opts?: MutationOpts<CompleteResult, number>) {
  const { wid, api: ws } = useWs()
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation<CompleteResult, Error, number, Snapshot>({
    mutationFn: (id: number) => ws.post<CompleteResult>(`/api/tasks/${id}/complete`),
    ...withInvalidate(opts, () => inv.tasks()),
    // optimistic: tick the box immediately, roll back if the server disagrees
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.tasks(wid) })
      return patchCachedTask(qc, wid, id, {
        status: 'done',
        completed_at: new Date().toISOString(),
        is_overdue: false,
      })
    },
    onError: (error, id, snapshot, context) => {
      restoreSnapshot(qc, snapshot)
      opts?.onError?.(error, id, snapshot, context)
    },
  })
}

export function useReopenTask(opts?: MutationOpts<Task, number>) {
  const { wid, api: ws } = useWs()
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation<Task, Error, number, Snapshot>({
    mutationFn: (id: number) => ws.post<Task>(`/api/tasks/${id}/reopen`),
    ...withInvalidate(opts, () => inv.tasks()),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.tasks(wid) })
      return patchCachedTask(qc, wid, id, { status: 'todo', completed_at: null })
    },
    onError: (error, id, snapshot, context) => {
      restoreSnapshot(qc, snapshot)
      opts?.onError?.(error, id, snapshot, context)
    },
  })
}

export function useQuickAdd(
  opts?: MutationOpts<QuickAddResult, { text: string; dry_run?: boolean }>,
) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => ws.post<QuickAddResult>('/api/tasks/quick-add', body),
    ...withInvalidate(opts, (_r, vars) => (vars.dry_run ? Promise.resolve() : inv.tasks())),
  })
}

export function useBulk(opts?: MutationOpts<BulkResult, BulkRequest>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: BulkRequest) => ws.post<BulkResult>('/api/tasks/bulk', body),
    ...withInvalidate(opts, () => inv.tasks()),
  })
}

export function useReorder(opts?: MutationOpts<Task[], { status: Status; ordered_ids: number[] }>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => ws.post<Task[]>('/api/tasks/reorder', body),
    ...withInvalidate(opts, () => inv.tasks()),
  })
}

// ── Subtasks ──────────────────────────────────────────────────────────────

export function useAddSubtask(opts?: MutationOpts<Subtask, { taskId: number; title: string }>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ taskId, title }) => ws.post<Subtask>(`/api/tasks/${taskId}/subtasks`, { title }),
    ...withInvalidate(opts, () => inv.tasks()),
  })
}

export function useUpdateSubtask(
  opts?: MutationOpts<
    Subtask,
    { id: number; data: Partial<Pick<Subtask, 'title' | 'is_done' | 'position'>> }
  >,
) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => ws.patch<Subtask>(`/api/subtasks/${id}`, data),
    ...withInvalidate(opts, () => inv.tasks()),
  })
}

export function useDeleteSubtask(opts?: MutationOpts<void, number>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ws.delete(`/api/subtasks/${id}`),
    ...withInvalidate(opts, () => inv.tasks()),
  })
}

// ── Comments ──────────────────────────────────────────────────────────────

export function useComments(taskId: number) {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.comments(wid, taskId),
    queryFn: ({ signal }) => ws.get<Comment[]>(`/api/tasks/${taskId}/comments`, undefined, signal),
  })
}

function useInvalidateComments() {
  const { wid } = useWs()
  const qc = useQueryClient()
  return (taskId: number) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.comments(wid, taskId) }),
      qc.invalidateQueries({ queryKey: keys.tasks(wid) }),
    ])
}

export function useAddComment(opts?: MutationOpts<Comment, { taskId: number; body: string }>) {
  const { api: ws } = useWs()
  const inv = useInvalidateComments()
  return useMutation({
    mutationFn: ({ taskId, body }) => ws.post<Comment>(`/api/tasks/${taskId}/comments`, { body }),
    ...withInvalidate(opts, (_c, vars) => inv(vars.taskId)),
  })
}

export function useUpdateComment(
  opts?: MutationOpts<Comment, { taskId: number; id: number; body: string }>,
) {
  const { api: ws } = useWs()
  const inv = useInvalidateComments()
  return useMutation({
    mutationFn: ({ taskId, id, body }) =>
      ws.patch<Comment>(`/api/tasks/${taskId}/comments/${id}`, { body }),
    ...withInvalidate(opts, (_c, vars) => inv(vars.taskId)),
  })
}

export function useDeleteComment(opts?: MutationOpts<void, { taskId: number; id: number }>) {
  const { api: ws } = useWs()
  const inv = useInvalidateComments()
  return useMutation({
    mutationFn: ({ taskId, id }) => ws.delete(`/api/tasks/${taskId}/comments/${id}`),
    ...withInvalidate(opts, (_v, vars) => inv(vars.taskId)),
  })
}

// ── Projects ──────────────────────────────────────────────────────────────

export function useProjects(includeArchived = true) {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: [...keys.projects(wid), { includeArchived }],
    queryFn: ({ signal }) =>
      ws.get<ProjectWithStats[]>('/api/projects', { include_archived: includeArchived }, signal),
  })
}

export type ProjectInput = { name: string; description?: string; color?: string }

export function useCreateProject(opts?: MutationOpts<Project, ProjectInput>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => ws.post<Project>('/api/projects', body),
    ...withInvalidate(opts, () => inv.projects()),
  })
}

export function useUpdateProject(
  opts?: MutationOpts<
    Project,
    { id: number; data: Partial<ProjectInput> & { is_archived?: boolean } }
  >,
) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => ws.patch<Project>(`/api/projects/${id}`, data),
    ...withInvalidate(opts, () => inv.projects()),
  })
}

export function useDeleteProject(opts?: MutationOpts<void, number>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ws.delete(`/api/projects/${id}`),
    ...withInvalidate(opts, () => inv.projects()),
  })
}

// ── Tags ──────────────────────────────────────────────────────────────────

export function useTags() {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.tags(wid),
    queryFn: ({ signal }) => ws.get<TagWithCount[]>('/api/tags', undefined, signal),
  })
}

export function useCreateTag(opts?: MutationOpts<Tag, { name: string; color?: string }>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body) => ws.post<Tag>('/api/tags', body),
    ...withInvalidate(opts, () => inv.tags()),
  })
}

export function useUpdateTag(
  opts?: MutationOpts<Tag, { id: number; data: { name?: string; color?: string } }>,
) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data }) => ws.patch<Tag>(`/api/tags/${id}`, data),
    ...withInvalidate(opts, () => inv.tags()),
  })
}

export function useDeleteTag(opts?: MutationOpts<void, number>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => ws.delete(`/api/tags/${id}`),
    ...withInvalidate(opts, () => inv.tags()),
  })
}

// ── Stats / data / meta ───────────────────────────────────────────────────

export function useOverview() {
  const { wid, api: ws } = useWs()
  return useQuery({
    queryKey: keys.stats(wid),
    queryFn: ({ signal }) => ws.get<Overview>('/api/stats/overview', undefined, signal),
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
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ bundle, replace }) =>
      ws.post<ImportResult>('/api/data/import', bundle, { replace }),
    ...withInvalidate(opts, () => inv.workspace()),
  })
}

export function useImportLegacy(opts?: MutationOpts<ImportResult, unknown>) {
  const { api: ws } = useWs()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (payload: unknown) => ws.post<ImportResult>('/api/data/import/legacy', payload),
    ...withInvalidate(opts, () => inv.workspace()),
  })
}

export async function downloadExport(workspaceId: number, workspaceName: string): Promise<void> {
  const bundle = await scoped(workspaceId).get<unknown>('/api/data/export')
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  a.href = url
  a.download = `planner-${slug || 'export'}-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

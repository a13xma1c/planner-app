/** TypeScript mirror of the backend Pydantic schemas (planner/schemas.py). */

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Status = 'todo' | 'in_progress' | 'done'
export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'
export type TaskSort =
  'smart' | 'due_date' | 'priority' | 'created' | 'updated' | 'title' | 'position'

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']
export const STATUSES: Status[] = ['todo', 'in_progress', 'done']
export const RECURRENCES: Recurrence[] = [
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
]

export type Role = 'owner' | 'editor' | 'viewer'
export const ROLES: Role[] = ['owner', 'editor', 'viewer']

export interface User {
  id: number
  email: string
  display_name: string
}

/** What members of a workspace see about each other. */
export interface UserPublic {
  id: number
  display_name: string
}

export interface Workspace {
  id: number
  name: string
  is_personal: boolean
  created_at: string
}

export interface WorkspaceSummary extends Workspace {
  role: Role
  member_count: number
  open_task_count: number
}

export interface Member {
  user: UserPublic
  role: Role
  joined_at: string
}

export interface Invitation {
  id: number
  token: string
  role: Role
  email: string | null
  created_at: string
  expires_at: string
  max_uses: number | null
  use_count: number
  revoked_at: string | null
  is_valid: boolean
}

export interface InvitationPreview {
  workspace_name: string
  role: Role
  invited_by: string | null
  member_count: number
  is_valid: boolean
  email: string | null
}

export interface Comment {
  id: number
  task_id: number
  author: UserPublic | null
  body: string
  created_at: string
  updated_at: string
}

export interface SessionInfo {
  id: number
  created_at: string
  last_seen_at: string
  user_agent: string
  is_current: boolean
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface TagWithCount extends Tag {
  task_count: number
}

export interface Project {
  id: number
  name: string
  description: string
  color: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface ProjectWithStats extends Project {
  task_count: number
  done_count: number
  overdue_count: number
}

export interface Subtask {
  id: number
  task_id: number
  title: string
  is_done: boolean
  position: number
}

export interface Task {
  id: number
  title: string
  notes: string
  project_id: number | null
  project: Project | null
  priority: Priority
  status: Status
  due_date: string | null
  recurrence: Recurrence | null
  estimate_minutes: number | null
  position: number
  completed_at: string | null
  created_at: string
  updated_at: string
  assignee_id: number | null
  assignee: UserPublic | null
  created_by: UserPublic | null
  comment_count: number
  tags: Tag[]
  subtasks: Subtask[]
  is_overdue: boolean
}

export interface TaskCreate {
  title: string
  notes?: string
  project_id?: number | null
  priority?: Priority
  status?: Status
  due_date?: string | null
  recurrence?: Recurrence | null
  estimate_minutes?: number | null
  assignee_id?: number | null
  tags?: string[]
  subtasks?: string[]
}

export interface TaskUpdate {
  title?: string
  notes?: string
  project_id?: number | null
  priority?: Priority
  status?: Status
  due_date?: string | null
  recurrence?: Recurrence | null
  estimate_minutes?: number | null
  assignee_id?: number | null
  tags?: string[]
  position?: number
}

export interface TaskFilters {
  project_id?: number
  inbox?: boolean
  status?: Status[]
  priority?: Priority[]
  tag?: string[]
  search?: string
  due_from?: string
  due_to?: string
  overdue?: boolean
  assignee_id?: number
  assigned_to_me?: boolean
  unassigned?: boolean
  include_done?: boolean
  sort?: TaskSort
  order?: 'asc' | 'desc'
  limit?: number
}

export interface CompleteResult {
  task: Task
  next_task: Task | null
}

export interface QuickAddPreview {
  title: string
  project_name: string | null
  project_id: number | null
  priority: Priority
  due_date: string | null
  recurrence: Recurrence | null
  tags: string[]
  estimate_minutes: number | null
  warnings: string[]
}

export interface QuickAddResult {
  preview: QuickAddPreview
  task: Task | null
}

export type BulkAction =
  | 'complete'
  | 'reopen'
  | 'delete'
  | 'set_status'
  | 'set_priority'
  | 'move_to_project'
  | 'set_due_date'
  | 'add_tag'
  | 'assign'

export interface BulkRequest {
  ids: number[]
  action: BulkAction
  status?: Status
  priority?: Priority
  project_id?: number | null
  due_date?: string | null
  tag?: string
  assignee_id?: number | null
}

export interface BulkResult {
  affected: number
  tasks: Task[]
}

export interface DayCount {
  day: string
  count: number
}

export interface ProjectProgress {
  id: number | null
  name: string
  color: string
  total: number
  done: number
}

export interface MemberLoad {
  user: UserPublic | null
  open: number
  overdue: number
}

export interface Overview {
  total: number
  open: number
  by_status: Record<Status, number>
  by_priority: Record<Priority, number>
  overdue: number
  due_today: number
  due_this_week: number
  completed_today: number
  completed_last_7_days: number
  completion_rate: number
  completed_series: DayCount[]
  created_series: DayCount[]
  projects: ProjectProgress[]
  members: MemberLoad[]
  streak_days: number
}

export interface ImportResult {
  projects: number
  tags: number
  tasks: number
  subtasks: number
  skipped: number
  warnings: string[]
}

export interface Health {
  status: 'ok'
  version: string
  database: string
}

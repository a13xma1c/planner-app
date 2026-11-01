import { createContext, useContext } from 'react'

import type { Member, Role, User, WorkspaceSummary } from '@/api/types'

export interface WorkspaceContextValue {
  workspace: WorkspaceSummary
  members: Member[]
  me: User
  role: Role
  /** Editors and owners may change data; viewers are read-only. */
  canEdit: boolean
  isOwner: boolean
  /** True when more than one person belongs to the workspace. */
  isShared: boolean
  /** Build an absolute path inside the current workspace, e.g. path('/tasks'). */
  path: (suffix?: string) => string
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceLayout')
  return ctx
}

/** The active workspace id, or null outside a workspace route (auth pages, join page). */
export function useWorkspaceId(): number | null {
  return useContext(WorkspaceContext)?.workspace.id ?? null
}

export const LAST_WORKSPACE_KEY = 'planner.lastWorkspace'

export function workspacePath(id: number, suffix = ''): string {
  return `/w/${id}${suffix}`
}

export function roleLabel(role: Role): string {
  return { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }[role]
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

/** Deterministic colour for a user avatar. */
export function avatarColor(id: number): string {
  const palette = [
    '#6366f1',
    '#0ea5e9',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#ec4899',
    '#8b5cf6',
    '#14b8a6',
  ]
  return palette[id % palette.length]!
}

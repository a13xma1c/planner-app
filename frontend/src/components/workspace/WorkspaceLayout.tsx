import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Link, Navigate, Outlet, useParams } from 'react-router'

import { scoped } from '@/api/client'
import { keys, useMe, useWorkspaces } from '@/api/queries'
import type { Member, User, WorkspaceSummary } from '@/api/types'
import { EmptyState, PageLoader } from '@/components/ui/Misc'
import { useWorkspaceEvents } from '@/lib/useWorkspaceEvents'
import {
  LAST_WORKSPACE_KEY,
  WorkspaceContext,
  workspacePath,
  type WorkspaceContextValue,
} from '@/lib/workspaceContext'

import { AppShell } from '../layout/AppShell'

/**
 * Layout route for /w/:workspaceId. Verifies membership, provides the workspace context
 * (role, members, helpers) and keeps the screen live via server-sent events.
 */
export function WorkspaceLayout() {
  const { workspaceId } = useParams()
  const id = Number(workspaceId)
  const { data: me } = useMe()
  const { data: workspaces, isLoading, error } = useWorkspaces()
  const workspace = workspaces?.find((w) => w.id === id)

  useEffect(() => {
    if (workspace) localStorage.setItem(LAST_WORKSPACE_KEY, String(workspace.id))
  }, [workspace])

  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/" replace />
  if (isLoading || !me) return <PageLoader />
  if (error) {
    return (
      <div className="p-8">
        <EmptyState title="Could not load your planners" description={error.message} />
      </div>
    )
  }
  if (!workspace) {
    return (
      <div className="mx-auto max-w-md p-8">
        <EmptyState
          title="You're not a member of this planner"
          description="Ask an owner for an invitation link, or pick one of your own planners."
          action={
            <Link to="/" className="text-sm font-medium text-indigo-600 hover:underline">
              Go to my planners
            </Link>
          }
        />
      </div>
    )
  }
  return <Provider workspace={workspace} me={me} />
}

function Provider({ workspace, me }: { workspace: WorkspaceSummary; me: User }) {
  // Members are needed all over (assignee pickers, avatars); load them once here. This
  // can't use `useMembers()` because that hook reads the context being created below.
  const { data: members = [] } = useQuery({
    queryKey: keys.members(workspace.id),
    queryFn: ({ signal }) =>
      scoped(workspace.id).get<Member[]>('/api/workspaces/current/members', undefined, signal),
  })
  useWorkspaceEvents(workspace.id)

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      members,
      me,
      role: workspace.role,
      canEdit: workspace.role !== 'viewer',
      isOwner: workspace.role === 'owner',
      isShared: !workspace.is_personal || workspace.member_count > 1,
      path: (suffix = '') => workspacePath(workspace.id, suffix),
    }),
    [workspace, members, me],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspaceContext.Provider>
  )
}

/** `/` → the planner used last time (or the personal one). */
export function WorkspaceRedirect() {
  const { data: workspaces, isLoading, error } = useWorkspaces()
  if (isLoading) return <PageLoader />
  if (error || !workspaces?.length) {
    return (
      <div className="p-8">
        <EmptyState
          title="No planner available"
          description={error?.message ?? 'Try signing in again.'}
        />
      </div>
    )
  }
  const last = Number(localStorage.getItem(LAST_WORKSPACE_KEY))
  const target =
    workspaces.find((w) => w.id === last) ?? workspaces.find((w) => w.is_personal) ?? workspaces[0]!
  return <Navigate to={workspacePath(target.id)} replace />
}

/** Old bookmarks (/tasks, /board …) keep working: send them into the last workspace. */
export function LegacyPathRedirect() {
  const { '*': rest = '' } = useParams()
  const { data: workspaces, isLoading } = useWorkspaces()
  if (isLoading) return <PageLoader />
  const last = Number(localStorage.getItem(LAST_WORKSPACE_KEY))
  const target = workspaces?.find((w) => w.id === last) ?? workspaces?.find((w) => w.is_personal)
  if (!target) return <Navigate to="/" replace />
  return <Navigate to={`${workspacePath(target.id)}/${rest}${window.location.search}`} replace />
}

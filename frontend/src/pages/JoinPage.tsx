import { Users } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'

import { useAcceptInvitation, useInvitationPreview, useMe } from '@/api/queries'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/Button'
import { ErrorState, PageLoader } from '@/components/ui/Misc'
import { roleLabel, workspacePath } from '@/lib/workspaceContext'

/** Landing page for invitation links: /join/:token */
export function JoinPage() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: me, isLoading: meLoading } = useMe()
  const { data: preview, isLoading, error } = useInvitationPreview(token)
  const accept = useAcceptInvitation({
    onSuccess: (ws) => navigate(workspacePath(ws.id), { replace: true }),
  })

  if (isLoading || meLoading) return <PageLoader />
  if (error || !preview) {
    return (
      <AuthLayout title="Invitation not found">
        <ErrorState error={error ?? new Error('This link is not valid.')} />
        <Link to="/" className="mt-4 block text-center text-sm text-indigo-600 hover:underline">
          Go to your planner
        </Link>
      </AuthLayout>
    )
  }
  if (!me) {
    const next = encodeURIComponent(location.pathname)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return (
    <AuthLayout
      title={`Join "${preview.workspace_name}"`}
      subtitle={
        preview.invited_by
          ? `${preview.invited_by} invited you to collaborate as ${roleLabel(preview.role).toLowerCase()}.`
          : `You've been invited as ${roleLabel(preview.role).toLowerCase()}.`
      }
    >
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <Users className="h-5 w-5 text-indigo-500" />
        <span>
          {preview.member_count} member{preview.member_count === 1 ? '' : 's'} so far
          {preview.email && ` · issued to ${preview.email}`}
        </span>
      </div>
      {!preview.is_valid && (
        <p role="alert" className="mt-4 text-sm text-rose-600">
          This invitation has expired or been revoked. Ask for a new link.
        </p>
      )}
      {accept.error && (
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {accept.error.message}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button
          className="flex-1"
          onClick={() => accept.mutate(token)}
          loading={accept.isPending}
          disabled={!preview.is_valid}
        >
          Join as {me.display_name}
        </Button>
        <Link to="/">
          <Button variant="outline">Not now</Button>
        </Link>
      </div>
    </AuthLayout>
  )
}

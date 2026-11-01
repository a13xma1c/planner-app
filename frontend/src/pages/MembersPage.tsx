import { Copy, Link2, LogOut, Trash2, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import {
  useCreateInvitation,
  useDeleteWorkspace,
  useInvitations,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMember,
  useUpdateWorkspace,
} from '@/api/queries'
import { ROLES, type Member, type Role } from '@/api/types'
import { Card } from '@/components/dashboard/widgets'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Input'
import { EmptyState, ErrorState, PageHeader, PageLoader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/toastContext'
import { Avatar } from '@/components/workspace/Avatar'
import { formatDateTime } from '@/lib/dates'
import { roleLabel, useWorkspace } from '@/lib/workspaceContext'

const ROLE_HELP: Record<Role, string> = {
  owner: 'Manage members, invitations and the planner itself.',
  editor: 'Add and change tasks, projects and tags.',
  viewer: 'Read-only access.',
}

export function MembersPage() {
  const { workspace, isOwner, me } = useWorkspace()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: members = [], isLoading, error, refetch } = useMembers()
  const fail = (e: Error) => toast.error('Could not update members', e.message)
  const updateMember = useUpdateMember({ onError: fail })
  const removeMember = useRemoveMember({
    onError: fail,
    onSuccess: (_v, userId) => {
      if (userId === me.id) {
        toast.success(`You left "${workspace.name}"`)
        navigate('/', { replace: true })
      }
    },
  })
  const [removing, setRemoving] = useState<Member | null>(null)
  const [leaving, setLeaving] = useState(false)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} retry={() => refetch()} />

  const mine = members.find((m) => m.user.id === me.id)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Members"
        subtitle={
          workspace.is_personal
            ? 'Your personal planner is private. Create a shared planner to collaborate.'
            : `${members.length} ${members.length === 1 ? 'person has' : 'people have'} access to "${workspace.name}".`
        }
        actions={
          !workspace.is_personal && mine?.role !== 'owner' ? (
            <Button variant="outline" size="sm" onClick={() => setLeaving(true)}>
              <LogOut className="h-3.5 w-3.5" /> Leave planner
            </Button>
          ) : undefined
        }
      />

      <Card title="People">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="member-list">
          {members.map((m) => {
            const isMe = m.user.id === me.id
            return (
              <li key={m.user.id} className="flex items-center gap-3 py-2.5">
                <Avatar user={m.user} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {m.user.display_name}
                    {isMe && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">Joined {formatDateTime(m.joined_at)}</p>
                </div>
                {isOwner && !workspace.is_personal ? (
                  <div className="w-32 shrink-0">
                    <Select
                      aria-label={`Role for ${m.user.display_name}`}
                      value={m.role}
                      onChange={(e) =>
                        updateMember.mutate({ userId: m.user.id, role: e.target.value as Role })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {roleLabel(m.role)}
                  </Badge>
                )}
                {isOwner && !isMe && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.user.display_name}`}
                    onClick={() => setRemoving(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        <dl className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="font-medium text-slate-700 dark:text-slate-300">{roleLabel(r)}</dt>
              <dd>{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {!workspace.is_personal && isOwner && <InvitationsCard />}
      {!workspace.is_personal && isOwner && <DangerZone />}
      {workspace.is_personal && (
        <EmptyState
          icon={UserPlus}
          title="Want to plan together?"
          description='Use "New shared planner" in the planner switcher, then invite people here.'
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) removeMember.mutate(removing.user.id)
          setRemoving(null)
        }}
        title={`Remove ${removing?.user.display_name}?`}
        message="They will lose access immediately. Tasks assigned to them stay, unassigned."
        confirmLabel="Remove"
      />
      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false)
          removeMember.mutate(me.id)
        }}
        title={`Leave "${workspace.name}"?`}
        message="You'll need a new invitation to get back in."
        confirmLabel="Leave"
      />
    </div>
  )
}

function InvitationsCard() {
  const toast = useToast()
  const { data: invitations = [] } = useInvitations()
  const [role, setRole] = useState<Role>('editor')
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(7)
  const create = useCreateInvitation({
    onSuccess: (inv) => {
      void copyLink(inv.token)
      setEmail('')
    },
    onError: (e) => toast.error('Could not create invitation', e.message),
  })
  const revoke = useRevokeInvitation({ onError: (e) => toast.error('Could not revoke', e.message) })

  const linkFor = (token: string) => `${window.location.origin}/join/${token}`
  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(token))
      toast.success('Invitation link copied', 'Send it to the person you want to invite.')
    } catch {
      toast.toast({ title: 'Invitation link', description: linkFor(token), duration: 15_000 })
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate({ role, email: email.trim() || null, expires_in_days: days })
  }
  const active = invitations.filter((i) => i.is_valid)

  return (
    <Card title="Invite people">
      <form
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
        data-testid="invite-form"
      >
        <Field label="Restrict to email (optional)" htmlFor="inv-email">
          <Input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="anyone with the link"
          />
        </Field>
        <Field label="Role" htmlFor="inv-role">
          <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </Select>
        </Field>
        <Field label="Expires" htmlFor="inv-days">
          <Select id="inv-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>in 1 day</option>
            <option value={7}>in 7 days</option>
            <option value={30}>in 30 days</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" loading={create.isPending}>
            <Link2 className="h-4 w-4" /> Create link
          </Button>
        </div>
      </form>

      {active.length > 0 && (
        <ul
          className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800"
          data-testid="invitation-list"
        >
          {active.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2">
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {roleLabel(inv.role)}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">
                {linkFor(inv.token)}
              </span>
              <span className="text-xs text-slate-400">
                {inv.email ? `for ${inv.email} · ` : ''}
                {inv.use_count} used · expires {formatDateTime(inv.expires_at)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyLink(inv.token)}
                aria-label="Copy invitation link"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revoke.mutate(inv.id)}
                aria-label="Revoke invitation"
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function DangerZone() {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState(workspace.name)
  const [confirm, setConfirm] = useState(false)
  const rename = useUpdateWorkspace({
    onSuccess: () => toast.success('Planner renamed'),
    onError: (e) => toast.error('Could not rename', e.message),
  })
  const remove = useDeleteWorkspace({
    onSuccess: () => {
      toast.success(`Deleted "${workspace.name}"`)
      navigate('/', { replace: true })
    },
    onError: (e) => toast.error('Could not delete', e.message),
  })

  return (
    <Card title="Planner settings">
      <form
        className="flex max-w-md items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && name.trim() !== workspace.name) rename.mutate({ name: name.trim() })
        }}
      >
        <Field label="Name" htmlFor="ws-rename" className="flex-1">
          <Input
            id="ws-rename"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </Field>
        <Button
          type="submit"
          variant="outline"
          loading={rename.isPending}
          disabled={!name.trim() || name.trim() === workspace.name}
        >
          Rename
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <p>Deleting removes every task, project and tag in this planner for all members.</p>
        <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
          <Trash2 className="h-3.5 w-3.5" /> Delete planner
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          remove.mutate()
        }}
        title={`Delete "${workspace.name}"?`}
        message="This permanently deletes the shared planner and everything in it, for everyone."
        confirmLabel="Delete planner"
        loading={remove.isPending}
      />
    </Card>
  )
}

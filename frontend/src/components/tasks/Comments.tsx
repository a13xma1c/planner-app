import { MessageSquare, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useAddComment, useComments, useDeleteComment, useUpdateComment } from '@/api/queries'
import type { Comment } from '@/api/types'
import { formatDateTime } from '@/lib/dates'
import { useWorkspace } from '@/lib/workspaceContext'

import { Button } from '../ui/Button'
import { Textarea } from '../ui/Input'
import { useToast } from '../ui/toastContext'
import { Avatar } from '../workspace/Avatar'

/** Discussion thread under a task. */
export function Comments({ taskId }: { taskId: number }) {
  const { me, canEdit, isOwner } = useWorkspace()
  const toast = useToast()
  const { data: comments = [], isLoading } = useComments(taskId)
  const [draft, setDraft] = useState('')
  const fail = (e: Error) => toast.error('Comment failed', e.message)
  const add = useAddComment({ onError: fail, onSuccess: () => setDraft('') })
  const remove = useDeleteComment({ onError: fail })

  const submit = () => {
    const body = draft.trim()
    if (body) add.mutate({ taskId, body })
  }

  return (
    <section aria-label="Comments" data-testid="comments">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <MessageSquare className="h-3.5 w-3.5" /> Comments{' '}
        {comments.length > 0 && (
          <span className="font-normal text-slate-400">{comments.length}</span>
        )}
      </h3>
      {isLoading && <p className="text-xs text-slate-400">Loading…</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            taskId={taskId}
            canEdit={canEdit && c.author?.id === me.id}
            canDelete={canEdit && (c.author?.id === me.id || isOwner)}
            onDelete={() => remove.mutate({ taskId, id: c.id })}
          />
        ))}
      </ul>
      {canEdit && (
        <form
          className="mt-3 flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Avatar user={me} />
          <div className="flex-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="Write a comment… (Ctrl+Enter to send)"
              aria-label="New comment"
              rows={2}
              className="min-h-[56px]"
            />
            <div className="mt-1.5 flex justify-end">
              <Button type="submit" size="sm" loading={add.isPending} disabled={!draft.trim()}>
                Comment
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}

function CommentItem({
  comment,
  taskId,
  canEdit,
  canDelete,
  onDelete,
}: {
  comment: Comment
  taskId: number
  canEdit: boolean
  canDelete: boolean
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const toast = useToast()
  const update = useUpdateComment({
    onSuccess: () => setEditing(false),
    onError: (e) => toast.error('Could not edit comment', e.message),
  })
  const edited =
    new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 1000

  return (
    <li className="group flex gap-2">
      {comment.author ? (
        <Avatar user={comment.author} />
      ) : (
        <span className="h-6 w-6 rounded-full bg-slate-300" aria-hidden />
      )}
      <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-slate-800 dark:text-slate-100">
            {comment.author?.display_name ?? 'Former member'}
          </span>
          <span className="text-slate-400">
            {formatDateTime(comment.created_at)}
            {edited && ' · edited'}
          </span>
          <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            {canEdit && !editing && (
              <button
                type="button"
                className="text-slate-400 hover:text-indigo-600"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="text-slate-400 hover:text-rose-600"
                onClick={onDelete}
                aria-label="Delete comment"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
        {editing ? (
          <form
            className="mt-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (body.trim()) update.mutate({ taskId, id: comment.id, body: body.trim() })
            }}
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              aria-label="Edit comment"
              className="min-h-[56px]"
            />
            <div className="mt-1 flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={update.isPending}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {comment.body}
          </p>
        )}
      </div>
    </li>
  )
}

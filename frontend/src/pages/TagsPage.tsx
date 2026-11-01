import { Tags as TagsIcon, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/api/queries'
import type { TagWithCount } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { EmptyState, ErrorState, PageHeader, PageLoader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/toastContext'
import { PROJECT_COLORS } from '@/lib/meta'
import { useWorkspace } from '@/lib/workspaceContext'

export function TagsPage() {
  const toast = useToast()
  const { path } = useWorkspace()
  const { data: tags = [], isLoading, error, refetch } = useTags()
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<TagWithCount | null>(null)
  const fail = (e: Error) => toast.error('Tag update failed', e.message)
  const create = useCreateTag({ onSuccess: () => setName(''), onError: fail })
  const update = useUpdateTag({ onError: fail })
  const remove = useDeleteTag({ onSuccess: () => setDeleting(null), onError: fail })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim())
      create.mutate({
        name: name.trim(),
        color: PROJECT_COLORS[tags.length % PROJECT_COLORS.length],
      })
  }

  return (
    <div>
      <PageHeader
        title="Tags"
        subtitle="Tags cut across projects. Filter any list by tag, or add them with #tag in quick add."
      />
      <form onSubmit={submit} className="mb-4 flex max-w-sm gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag name"
          aria-label="New tag name"
        />
        <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {isLoading && <PageLoader />}
      {error && <ErrorState error={error} retry={() => refetch()} />}
      {!isLoading && !error && tags.length === 0 && (
        <EmptyState icon={TagsIcon} title="No tags yet" />
      )}
      {tags.length > 0 && (
        <table className="w-full text-sm" data-testid="tags-table">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pl-2">Tag</th>
              <th className="py-2">Colour</th>
              <th className="py-2 text-right">Tasks</th>
              <th className="py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tags.map((t) => (
              <tr key={t.id}>
                <td className="py-2 pl-2">
                  <input
                    key={`${t.id}-${t.name}`}
                    defaultValue={t.name}
                    aria-label={`Rename tag ${t.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim().replace(/^#/, '').toLowerCase()
                      if (v && v !== t.name) update.mutate({ id: t.id, data: { name: v } })
                      else e.target.value = t.name
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="w-full max-w-[220px] rounded bg-transparent px-1 py-0.5 text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 dark:text-slate-100 dark:focus:bg-slate-900"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="color"
                    value={t.color}
                    aria-label={`Colour for ${t.name}`}
                    onChange={(e) => update.mutate({ id: t.id, data: { color: e.target.value } })}
                    className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </td>
                <td className="py-2 text-right tabular-nums">
                  <Link
                    to={path(`/tasks?tag=${encodeURIComponent(t.name)}&done=1`)}
                    className="text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {t.task_count}
                  </Link>
                </td>
                <td className="py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete tag ${t.name}`}
                    onClick={() => setDeleting(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={`Delete tag #${deleting?.name}?`}
        message={`It will be removed from ${deleting?.task_count ?? 0} task(s). The tasks themselves are kept.`}
        confirmLabel="Delete tag"
        loading={remove.isPending}
      />
    </div>
  )
}

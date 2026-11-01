import { FolderKanban, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useProjects } from '@/api/queries'
import type { Project } from '@/api/types'
import { ProjectDialog } from '@/components/projects/ProjectDialog'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, PageLoader, ProgressBar } from '@/components/ui/Misc'
import { pluralize } from '@/lib/utils'

export function ProjectsPage() {
  const [showArchived, setShowArchived] = useState(false)
  const { data: projects = [], isLoading, error, refetch } = useProjects(true)
  const [editing, setEditing] = useState<Project | null | undefined>(undefined) // undefined = closed, null = new

  const visible = projects.filter((p) => showArchived || !p.is_archived)
  const archivedCount = projects.filter((p) => p.is_archived).length

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${pluralize(projects.length - archivedCount, 'active project')}${archivedCount ? ` · ${archivedCount} archived` : ''}`}
        actions={
          <>
            {archivedCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="accent-indigo-600"
                />
                Show archived
              </label>
            )}
            <Button size="sm" onClick={() => setEditing(null)} data-testid="new-project-button">
              <Plus className="h-4 w-4" /> New project
            </Button>
          </>
        }
      />
      {isLoading && <PageLoader />}
      {error && <ErrorState error={error} retry={() => refetch()} />}
      {!isLoading && !error && visible.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Projects group related tasks. Use @Project in quick add once you have some."
          action={<Button onClick={() => setEditing(null)}>Create your first project</Button>}
        />
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-grid">
        {visible.map((p) => {
          const progress = p.task_count ? p.done_count / p.task_count : 0
          return (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="block h-full rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate font-medium text-slate-900 dark:text-white">
                      {p.name}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setEditing(p)
                    }}
                    className="shrink-0 text-xs text-slate-400 hover:text-indigo-600"
                  >
                    Edit
                  </button>
                </div>
                {p.description && (
                  <p className="mb-3 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                )}
                <ProgressBar value={progress} color={p.color} />
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {p.done_count}/{p.task_count} done
                  </span>
                  {p.overdue_count > 0 && (
                    <span className="text-rose-600">{pluralize(p.overdue_count, 'overdue')}</span>
                  )}
                  {p.is_archived && <span className="uppercase">Archived</span>}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
      <ProjectDialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        project={editing ?? null}
      />
    </div>
  )
}

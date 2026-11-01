import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'

import { useDeleteProject, useProjects, useTasks, useUpdateProject } from '@/api/queries'
import type { ProjectWithStats, Task, TaskFilters } from '@/api/types'
import { ProjectDialog } from '@/components/projects/ProjectDialog'
import { BulkBar } from '@/components/tasks/BulkBar'
import { FilterBar } from '@/components/tasks/FilterBar'
import { TaskList } from '@/components/tasks/TaskList'
import { useTaskActions } from '@/components/tasks/useTaskActions'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { ErrorState, PageHeader, PageLoader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/toastContext'
import { addDaysISO, dayHeading, formatLongDate, parseDate, todayISO } from '@/lib/dates'
import { filtersToParams, filtersToQuery, parseFilters, type FilterState } from '@/lib/filters'
import { useTaskPanel } from '@/lib/taskPanel'
import { useWorkspace } from '@/lib/workspaceContext'
import { useUrlState } from '@/lib/useUrlState'
import { pluralize } from '@/lib/utils'

export type TasksMode = 'all' | 'inbox' | 'today' | 'upcoming' | 'assigned' | 'project'

const TITLES: Record<Exclude<TasksMode, 'project'>, { title: string; subtitle: string }> = {
  all: { title: 'All tasks', subtitle: 'Everything, across every project.' },
  inbox: { title: 'Inbox', subtitle: 'Tasks that are not assigned to a project.' },
  today: { title: 'Today', subtitle: 'Due today, plus anything overdue.' },
  upcoming: { title: 'Upcoming', subtitle: 'The next two weeks, day by day.' },
  assigned: { title: 'Assigned to me', subtitle: 'Everything this planner expects from you.' },
}

export function TasksPage({ mode }: { mode: TasksMode }) {
  const params = useParams()
  const projectId = mode === 'project' ? Number(params.projectId) : undefined
  if (mode === 'project' && (!projectId || Number.isNaN(projectId)))
    return <Navigate to=".." replace />
  return <TasksView key={`${mode}-${projectId ?? ''}`} mode={mode} projectId={projectId} />
}

function TasksView({ mode, projectId }: { mode: TasksMode; projectId?: number }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useUrlState(parseFilters, filtersToParams)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [today] = useState(() => todayISO())
  const { open } = useTaskPanel()
  const { toggleDone } = useTaskActions()
  const { path, canEdit } = useWorkspace()

  const dueParam = searchParams.get('due')
  const due = dueParam && /^\d{4}-\d{2}-\d{2}$/.test(dueParam) ? dueParam : null

  const query: TaskFilters = useMemo(() => {
    const base = filtersToQuery(filters)
    if (due) return { ...base, due_from: due, due_to: due, include_done: true }
    switch (mode) {
      case 'inbox':
        return { ...base, inbox: true }
      case 'project':
        return { ...base, project_id: projectId }
      case 'today':
        return { ...base, due_to: today }
      case 'assigned':
        return { ...base, assigned_to_me: true }
      case 'upcoming':
        return {
          ...base,
          due_from: today,
          due_to: addDaysISO(14, parseDate(today)!),
          sort: base.sort === 'smart' ? 'due_date' : base.sort,
        }
      default:
        return base
    }
  }, [filters, mode, projectId, due, today])

  const { data: tasks = [], isLoading, error, refetch } = useTasks(query)
  const { data: projects = [] } = useProjects(true)
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined

  const toggleSelect = useCallback(
    (id: number) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [],
  )
  const visibleSelected = useMemo(
    () => tasks.filter((t) => selected.has(t.id)).map((t) => t.id),
    [tasks, selected],
  )

  const groupBy =
    mode === 'today' ? groupForToday(today) : mode === 'upcoming' ? groupByDay : undefined

  const header = due ? (
    <PageHeader
      title={`Due ${formatLongDate(due)}`}
      subtitle={pluralize(tasks.length, 'task')}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSearchParams((prev) => {
              prev.delete('due')
              return prev
            })
          }
        >
          Clear date
        </Button>
      }
    />
  ) : mode === 'project' ? (
    <ProjectHeader
      projectId={projectId!}
      project={project}
      count={tasks.length}
      canEdit={canEdit}
      path={path}
    />
  ) : (
    <PageHeader title={TITLES[mode].title} subtitle={TITLES[mode].subtitle} />
  )

  return (
    <div>
      {header}
      <FilterBar
        value={filters}
        onChange={setFilters}
        hideStatus={mode === 'upcoming'}
        hideAssignee={mode === 'assigned'}
      />
      {isLoading && <PageLoader />}
      {error && <ErrorState error={error} retry={() => refetch()} />}
      {!isLoading && !error && (
        <TaskList
          tasks={tasks}
          onOpen={open}
          onToggleDone={toggleDone}
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          showProject={mode !== 'project'}
          groupBy={groupBy}
          keyboard
          emptyTitle={mode === 'today' ? 'Nothing due today 🎉' : undefined}
          emptyDescription={filtersActive(filters) ? 'Try clearing some filters.' : undefined}
        />
      )}
      <BulkBar
        selectedIds={canEdit ? visibleSelected : []}
        onClear={() => setSelected(new Set())}
        onSelectAll={() => setSelected(new Set(tasks.map((t) => t.id)))}
        total={tasks.length}
      />
    </div>
  )
}

const groupForToday = (today: string) => (t: Task) =>
  t.status === 'done'
    ? { key: 'done', heading: 'Completed' }
    : t.due_date && t.due_date < today
      ? { key: 'overdue', heading: 'Overdue' }
      : { key: 'today', heading: 'Today' }

const groupByDay = (t: Task) => ({
  key: t.due_date ?? 'none',
  heading: dayHeading(t.due_date ?? ''),
})

function filtersActive(f: FilterState): boolean {
  return Boolean(f.search || f.status.length || f.priority.length || f.tag.length)
}

function ProjectHeader({
  projectId,
  project,
  count,
  canEdit,
  path,
}: {
  projectId: number
  project: ProjectWithStats | undefined
  count: number
  canEdit: boolean
  path: (s: string) => string
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const update = useUpdateProject({
    onError: (e) => toast.error('Could not update project', e.message),
  })
  const remove = useDeleteProject({
    onSuccess: () => {
      toast.success('Project deleted', 'Its tasks were moved to the Inbox.')
      navigate(path('/projects'))
    },
    onError: (e) => toast.error('Could not delete project', e.message),
  })

  if (!project) return <PageHeader title="Project" subtitle={`#${projectId}`} />

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
            {project.is_archived && (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                Archived
              </span>
            )}
          </span>
        }
        subtitle={project.description || `${pluralize(count, 'task')} · ${project.done_count} done`}
        actions={
          canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update.mutate({ id: project.id, data: { is_archived: !project.is_archived } })
                }
              >
                {project.is_archived ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                {project.is_archived ? 'Unarchive' : 'Archive'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete project"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )
        }
      />
      <ProjectDialog open={editOpen} onClose={() => setEditOpen(false)} project={project} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(project.id)}
        title={`Delete "${project.name}"?`}
        message="The project will be removed. Its tasks are kept and moved to the Inbox."
        confirmLabel="Delete project"
        loading={remove.isPending}
      />
    </>
  )
}

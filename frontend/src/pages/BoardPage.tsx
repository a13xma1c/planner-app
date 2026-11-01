import { useMemo } from 'react'

import { useProjects, useTasks } from '@/api/queries'
import { Board } from '@/components/board/Board'
import { Select } from '@/components/ui/Input'
import { ErrorState, PageHeader, PageLoader } from '@/components/ui/Misc'
import { useTaskPanel } from '@/lib/taskPanel'
import { useUrlState } from '@/lib/useUrlState'

const parseProject = (p: URLSearchParams) => p.get('project')
const serializeProject = (value: string | null, prev: URLSearchParams) => {
  const next = new URLSearchParams(prev)
  if (value) next.set('project', value)
  else next.delete('project')
  return next
}

export function BoardPage() {
  const [projectParam, setProjectParam] = useUrlState(parseProject, serializeProject)
  const filters = useMemo(() => {
    if (projectParam === 'inbox') return { inbox: true, sort: 'position' as const }
    if (projectParam) return { project_id: Number(projectParam), sort: 'position' as const }
    return { sort: 'position' as const }
  }, [projectParam])
  const { data: tasks = [], isLoading, error, refetch } = useTasks(filters)
  const { data: projects = [] } = useProjects(false)
  const { open } = useTaskPanel()

  return (
    <div>
      <PageHeader
        title="Board"
        subtitle="Drag cards between columns to change status, or reorder within a column."
        actions={
          <Select
            aria-label="Filter board by project"
            value={projectParam ?? ''}
            onChange={(e) => setProjectParam(e.target.value || null)}
            className="w-auto"
          >
            <option value="">All projects</option>
            <option value="inbox">Inbox</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        }
      />
      {isLoading && <PageLoader />}
      {error && <ErrorState error={error} retry={() => refetch()} />}
      {!isLoading && !error && <Board tasks={tasks} onOpen={open} showProject={!projectParam} />}
    </div>
  )
}

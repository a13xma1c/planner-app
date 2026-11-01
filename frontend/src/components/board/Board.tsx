import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckSquare, GripVertical, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useCreateTask, useReorder } from '@/api/queries'
import { STATUSES, type Status, type Task } from '@/api/types'
import { STATUS_META } from '@/lib/meta'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspaceContext'

import { DueBadge, PriorityBadge, ProjectDot, TagChip } from '../tasks/badges'
import { AssigneeChip } from '../workspace/Avatar'
import { useToast } from '../ui/toastContext'
import { Input } from '../ui/Input'

type Columns = Record<Status, Task[]>

function buildColumns(tasks: Task[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], done: [] }
  for (const t of tasks) cols[t.status].push(t)
  for (const s of STATUSES) cols[s].sort((a, b) => a.position - b.position || a.id - b.id)
  return cols
}

const ids = (list: Task[]): string => list.map((t) => t.id).join()

function findColumn(cols: Columns, id: string | number): Status | undefined {
  if (typeof id === 'string' && (STATUSES as string[]).includes(id)) return id as Status
  return STATUSES.find((s) => cols[s].some((t) => t.id === id))
}

interface BoardProps {
  tasks: Task[]
  onOpen: (id: number) => void
  showProject?: boolean
}

/** Kanban board: drag cards between/within columns; persists order via /tasks/reorder. */
export function Board({ tasks, onOpen, showProject = true }: BoardProps) {
  const toast = useToast()
  const [cols, setCols] = useState<Columns>(() => buildColumns(tasks))
  const [activeId, setActiveId] = useState<number | null>(null)
  const [syncedTasks, setSyncedTasks] = useState(tasks)
  const reorder = useReorder({ onError: (e) => toast.error('Could not move task', e.message) })

  // Adopt fresh server data whenever it changes and we're not mid-drag.
  if (tasks !== syncedTasks && activeId === null) {
    setSyncedTasks(tasks)
    setCols(buildColumns(tasks))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeTask = useMemo(
    () => (activeId === null ? null : (tasks.find((t) => t.id === activeId) ?? null)),
    [activeId, tasks],
  )

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(Number(active.id))

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const from = findColumn(cols, active.id)
    const to = findColumn(cols, over.id)
    if (!from || !to || from === to) return
    setCols((prev) => {
      const moving = prev[from].find((t) => t.id === active.id)
      if (!moving) return prev
      const fromList = prev[from].filter((t) => t.id !== active.id)
      const toList = [...prev[to]]
      const overIndex = toList.findIndex((t) => t.id === over.id)
      const insertAt = overIndex >= 0 ? overIndex : toList.length
      toList.splice(insertAt, 0, { ...moving, status: to })
      return { ...prev, [from]: fromList, [to]: toList }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = Number(active.id)
    setActiveId(null)
    if (!over) return
    const col = findColumn(cols, active.id)
    if (!col) return
    const list = [...cols[col]]
    const fromIndex = list.findIndex((t) => t.id === id)
    const toIndex = over.id === col ? list.length - 1 : list.findIndex((t) => t.id === over.id)
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      const [moved] = list.splice(fromIndex, 1)
      list.splice(toIndex, 0, moved!)
    }
    const next = { ...cols, [col]: list }
    setCols(next)
    const original = tasks.find((t) => t.id === id)
    const serverColumn = buildColumns(tasks)[col]
    const orderChanged = ids(list) !== ids(serverColumn)
    if (original?.status !== col || orderChanged) {
      reorder.mutate({ status: col, ordered_ids: list.map((t) => t.id) })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid gap-4 md:grid-cols-3" data-testid="board">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={cols[status]}
            onOpen={onOpen}
            showProject={showProject}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div data-testid="drag-overlay">
            <CardBody task={activeTask} showProject={showProject} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  tasks,
  onOpen,
  showProject,
}: {
  status: Status
  tasks: Task[]
  onOpen: (id: number) => void
  showProject: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const meta = STATUS_META[status]
  return (
    <section
      aria-label={`${meta.label} column`}
      data-testid={`column-${status}`}
      className={cn(
        'flex min-h-[60vh] flex-col rounded-xl border-t-4 bg-slate-100/70 p-2 dark:bg-slate-800/40',
        meta.accent,
        isOver && 'ring-2 ring-indigo-400',
      )}
    >
      <header className="flex items-center justify-between px-2 py-1.5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{meta.label}</h2>
        <span className="rounded-full bg-white px-2 text-xs tabular-nums text-slate-500 dark:bg-slate-900">
          {tasks.length}
        </span>
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-1">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} onOpen={onOpen} showProject={showProject} />
          ))}
          {tasks.length === 0 && (
            <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-xs text-slate-400 dark:border-slate-700">
              Drop tasks here
            </li>
          )}
        </ul>
      </SortableContext>
      <ColumnQuickAdd status={status} />
    </section>
  )
}

function SortableCard({
  task,
  onOpen,
  showProject,
}: {
  task: Task
  onOpen: (id: number) => void
  showProject: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      data-testid="board-card"
      data-task-id={task.id}
    >
      <CardBody
        task={task}
        showProject={showProject}
        onOpen={onOpen}
        handleProps={{ ...attributes, ...listeners }}
      />
    </li>
  )
}

function CardBody({
  task,
  showProject,
  onOpen,
  handleProps,
  dragging = false,
}: {
  task: Task
  showProject: boolean
  onOpen?: (id: number) => void
  handleProps?: React.HTMLAttributes<HTMLButtonElement>
  dragging?: boolean
}) {
  const done = task.status === 'done'
  const subDone = task.subtasks.filter((s) => s.is_done).length
  return (
    <div
      className={cn(
        'group flex gap-1 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900',
        dragging && 'rotate-1 shadow-xl',
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${task.title}`}
        className="-ml-1 mt-0.5 cursor-grab touch-none rounded p-0.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        {...handleProps}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onOpen?.(task.id)}
        className="min-w-0 flex-1 text-left"
        aria-label={`Open ${task.title}`}
      >
        <p
          className={cn(
            'text-sm font-medium text-slate-900 dark:text-slate-100',
            done && 'text-slate-400 line-through',
          )}
        >
          {task.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {showProject && <ProjectDot project={task.project} />}
          <DueBadge due={task.due_date} done={done} recurrence={task.recurrence} />
          {task.priority !== 'medium' && <PriorityBadge priority={task.priority} compact />}
          {task.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <CheckSquare className="h-3 w-3" /> {subDone}/{task.subtasks.length}
            </span>
          )}
          {task.tags.slice(0, 3).map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          <AssigneeChip user={task.assignee} />
        </div>
      </button>
    </div>
  )
}

/** "+ Add task" at the bottom of a column; creates the task directly in that status. */
function ColumnQuickAdd({ status }: { status: Status }) {
  const { canEdit } = useWorkspace()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const create = useCreateTask({
    onSuccess: () => setTitle(''),
    onError: (e) => toast.error('Could not add task', e.message),
  })
  if (!canEdit) return null
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-100"
        data-testid={`add-to-${status}`}
      >
        <Plus className="h-3.5 w-3.5" /> Add task
      </button>
    )
  }
  return (
    <form
      className="mt-1 p-1"
      onSubmit={(e) => {
        e.preventDefault()
        const t = title.trim()
        if (t) create.mutate({ title: t, status })
      }}
    >
      <Input
        // focus on mount: the user just pressed "Add task" in this column
        ref={(el) => el?.focus()}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setTitle('')
          }
        }}
        onBlur={() => !title.trim() && setOpen(false)}
        placeholder={`New task in ${STATUS_META[status].label.toLowerCase()}…`}
        aria-label={`New task in ${STATUS_META[status].label}`}
        disabled={create.isPending}
        className="text-sm"
      />
    </form>
  )
}

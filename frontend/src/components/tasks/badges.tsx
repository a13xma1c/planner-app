import { CalendarDays, Clock, Repeat } from 'lucide-react'

import type { Priority, Project, Recurrence, Status, Tag } from '@/api/types'
import { describeDue } from '@/lib/dates'
import { INBOX_COLOR, PRIORITY_META, RECURRENCE_META, STATUS_META } from '@/lib/meta'
import { cn, formatMinutes } from '@/lib/utils'

import { Badge } from '../ui/Badge'

export function PriorityBadge({
  priority,
  compact = false,
}: {
  priority: Priority
  compact?: boolean
}) {
  const meta = PRIORITY_META[priority]
  return (
    <Badge className={meta.className} title={`${meta.label} priority`}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {compact ? meta.short : meta.label}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status]
  return <Badge className={meta.className}>{meta.label}</Badge>
}

const dueTone = {
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  today: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  soon: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  later: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300',
  none: '',
}

export function DueBadge({
  due,
  done = false,
  recurrence,
}: {
  due: string | null
  done?: boolean
  recurrence?: Recurrence | null
}) {
  const info = describeDue(due)
  if (info.tone === 'none') return null
  return (
    <Badge
      className={cn(done ? dueTone.later : dueTone[info.tone])}
      title={
        recurrence ? `${due} · repeats ${RECURRENCE_META[recurrence].toLowerCase()}` : (due ?? '')
      }
    >
      {recurrence ? <Repeat className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
      {info.label}
    </Badge>
  )
}

export function EstimateBadge({ minutes }: { minutes: number | null }) {
  if (!minutes) return null
  return (
    <Badge
      className="bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300"
      title="Estimate"
    >
      <Clock className="h-3 w-3" />
      {formatMinutes(minutes)}
    </Badge>
  )
}

export function TagChip({
  tag,
  onClick,
  active,
}: {
  tag: Tag | { name: string; color?: string }
  onClick?: () => void
  active?: boolean
}) {
  const color = 'color' in tag && tag.color ? tag.color : '#64748b'
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
        'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300',
        onClick && 'hover:bg-slate-100 dark:hover:bg-slate-800',
        active && 'bg-slate-200 dark:bg-slate-700',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />#{tag.name}
    </Comp>
  )
}

export function ProjectDot({
  project,
  showName = true,
  className,
}: {
  project: Project | null
  showName?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400',
        className,
      )}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: project?.color ?? INBOX_COLOR }}
        aria-hidden
      />
      {showName && <span className="truncate">{project?.name ?? 'Inbox'}</span>}
    </span>
  )
}

import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { DayCount, ProjectProgress } from '@/api/types'
import { parseDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

import { ProgressBar } from '../ui/Misc'

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  to?: string
  tone?: 'default' | 'danger' | 'success' | 'warning'
}) {
  const tones = {
    default: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-300',
    danger: 'text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-300',
    success: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300',
    warning: 'text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300',
  }
  const body = (
    <>
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p
          className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white"
          data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {value}
        </p>
        {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
      </div>
    </>
  )
  const className =
    'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'
  return to ? (
    <Link to={to} className={cn(className, 'transition hover:border-indigo-300 hover:shadow-sm')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** Two-series bar chart (completed vs created) rendered with plain divs. */
export function ActivityChart({
  completed,
  created,
}: {
  completed: DayCount[]
  created: DayCount[]
}) {
  const max = Math.max(1, ...completed.map((d) => d.count), ...created.map((d) => d.count))
  return (
    <div>
      <div
        className="flex h-32 items-end gap-1"
        role="img"
        aria-label="Tasks completed and created over the last 14 days"
      >
        {completed.map((c, i) => {
          const n = created[i]?.count ?? 0
          const d = parseDate(c.day)
          return (
            <div
              key={c.day}
              className="group relative flex h-full flex-1 items-end justify-center gap-px"
              title={`${c.day}: ${c.count} completed, ${n} created`}
            >
              <div
                className="w-1/2 rounded-t bg-slate-200 transition-all dark:bg-slate-700"
                style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 }}
              />
              <div
                className="w-1/2 rounded-t bg-indigo-500 transition-all"
                style={{ height: `${(c.count / max) * 100}%`, minHeight: c.count ? 3 : 0 }}
              />
              <span className="absolute -bottom-4 text-[9px] text-slate-400">
                {d && i % 2 === 1 ? format(d, 'd') : ''}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-6 flex gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-indigo-500" /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-slate-300 dark:bg-slate-600" /> Created
        </span>
      </div>
    </div>
  )
}

export function ProjectProgressList({ projects }: { projects: ProjectProgress[] }) {
  if (projects.length === 0) return <p className="text-sm text-slate-500">No tasks yet.</p>
  return (
    <ul className="space-y-3">
      {projects.map((p) => (
        <li key={p.id ?? 'inbox'}>
          <Link to={p.id === null ? '/inbox' : `/projects/${p.id}`} className="group block">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-700 group-hover:underline dark:text-slate-200">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
              <span className="text-xs tabular-nums text-slate-500">
                {p.done}/{p.total}
              </span>
            </div>
            <ProgressBar value={p.total ? p.done / p.total : 0} color={p.color} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Display metadata for enums: labels, colours, icons. */
import type { Priority, Recurrence, Status, TaskSort } from '@/api/types'

export const PRIORITY_META: Record<
  Priority,
  { label: string; short: string; className: string; dot: string; rank: number }
> = {
  urgent: {
    label: 'Urgent',
    short: 'P1',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    dot: 'bg-rose-500',
    rank: 0,
  },
  high: {
    label: 'High',
    short: 'P2',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    dot: 'bg-orange-500',
    rank: 1,
  },
  medium: {
    label: 'Medium',
    short: 'P3',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    dot: 'bg-sky-500',
    rank: 2,
  },
  low: {
    label: 'Low',
    short: 'P4',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
    dot: 'bg-slate-400',
    rank: 3,
  },
}

export const STATUS_META: Record<Status, { label: string; className: string; accent: string }> = {
  todo: {
    label: 'To do',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200',
    accent: 'border-slate-300 dark:border-slate-600',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    accent: 'border-violet-400',
  },
  done: {
    label: 'Done',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    accent: 'border-emerald-400',
  },
}

export const RECURRENCE_META: Record<Recurrence, string> = {
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export const SORT_META: Record<TaskSort, string> = {
  smart: 'Smart',
  due_date: 'Due date',
  priority: 'Priority',
  created: 'Created',
  updated: 'Updated',
  title: 'Title',
  position: 'Manual',
}

export const PROJECT_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#64748b',
]

export const INBOX_COLOR = '#94a3b8'

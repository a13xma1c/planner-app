import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600',
        className,
      )}
    />
  )
}

export function PageLoader() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Spinner />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
      {Icon && <Icon className="mb-3 h-8 w-8 text-slate-400" />}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
    >
      <p className="font-medium">Could not load data</p>
      <p className="mt-1 text-xs">{message}</p>
      {retry && (
        <button type="button" onClick={retry} className="mt-2 text-xs font-semibold underline">
          Try again
        </button>
      )}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ProgressBar({
  value,
  color,
  className,
}: {
  value: number
  color?: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700',
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-indigo-500 transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function ColorSwatches({
  colors,
  value,
  onChange,
}: {
  colors: string[]
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            'h-6 w-6 rounded-full ring-offset-2 transition dark:ring-offset-slate-900',
            value === c && 'ring-2 ring-slate-900 dark:ring-white',
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

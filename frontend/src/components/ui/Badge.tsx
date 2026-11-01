import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </kbd>
  )
}

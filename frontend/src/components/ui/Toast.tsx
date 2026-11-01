import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import {
  ToastContext,
  type ToastContextValue,
  type ToastKind,
  type ToastOptions,
} from './toastContext'

interface ToastItem extends Required<Pick<ToastOptions, 'title' | 'kind'>> {
  id: number
  description?: string
  action?: ToastOptions['action']
}

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <AlertCircle className="h-4 w-4 text-rose-500" />,
  info: <Info className="h-4 w-4 text-sky-500" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback(
    (id: number) => setItems((prev) => prev.filter((t) => t.id !== id)),
    [],
  )

  const toast = useCallback(
    ({ title, description, kind = 'info', action, duration = 4500 }: ToastOptions) => {
      const id = ++counter.current
      setItems((prev) => [...prev.slice(-4), { id, title, description, kind, action }])
      if (duration > 0) setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, kind: 'success' }),
      error: (title, description) => toast({ title, description, kind: 'error', duration: 7000 }),
      dismiss,
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3 shadow-lg',
              'dark:border-slate-700 dark:bg-slate-800',
              t.kind === 'error' ? 'border-rose-200' : 'border-slate-200',
            )}
          >
            <span className="mt-0.5">{icons[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">
                  {t.description}
                </p>
              )}
              {t.action && (
                <button
                  type="button"
                  className="mt-1.5 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => {
                    t.action?.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

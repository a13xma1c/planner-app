import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastOptions {
  title: string
  description?: string
  kind?: ToastKind
  /** Optional action button, e.g. Undo. */
  action?: { label: string; onClick: () => void }
  duration?: number
}

export interface ToastContextValue {
  toast: (opts: ToastOptions) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

import { CornerDownLeft, Sparkles } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { useQuickAdd } from '@/api/queries'
import type { QuickAddPreview } from '@/api/types'
import { describeDue } from '@/lib/dates'
import { useDebounced } from '@/lib/hooks'
import { PRIORITY_META, RECURRENCE_META } from '@/lib/meta'
import { cn, formatMinutes } from '@/lib/utils'

import { Badge, Kbd } from '../ui/Badge'
import { useToast } from '../ui/toastContext'

export interface QuickAddHandle {
  focus: () => void
}

interface QuickAddProps {
  className?: string
  placeholder?: string
  onCreated?: (taskId: number) => void
}

/**
 * Natural-language task entry. The server parses the text; we show a live preview of
 * what will be created (debounced dry-run) and submit on Enter.
 */
export const QuickAdd = forwardRef<QuickAddHandle, QuickAddProps>(function QuickAdd(
  { className, placeholder, onCreated },
  ref,
) {
  const [text, setText] = useState('')
  // The preview remembers which input it was computed for, so stale previews are never shown.
  const [preview, setPreview] = useState<{ for: string; data: QuickAddPreview } | null>(null)
  const debounced = useDebounced(text.trim(), 300)
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  const previewMutation = useQuickAdd({
    onSuccess: (result, vars) => {
      if (vars.dry_run) setPreview({ for: vars.text, data: result.preview })
    },
  })
  const createMutation = useQuickAdd({
    onSuccess: (result) => {
      setText('')
      setPreview(null)
      if (result.task) {
        const id = result.task.id
        toast.toast({
          kind: 'success',
          title: `Added "${result.task.title}"`,
          description: result.preview.warnings.join(' ') || undefined,
          action: onCreated ? { label: 'Open', onClick: () => onCreated(id) } : undefined,
        })
      }
    },
    onError: (err) => toast.error('Could not add task', err.message),
  })

  const { mutate: runPreview } = previewMutation
  useEffect(() => {
    if (debounced) runPreview({ text: debounced, dry_run: true })
  }, [debounced, runPreview])

  const submit = () => {
    const value = text.trim()
    if (!value || createMutation.isPending) return
    createMutation.mutate({ text: value })
  }

  const current = preview && preview.for === debounced && text.trim() ? preview.data : null
  const due = current ? describeDue(current.due_date) : null

  return (
    <div className={cn('relative', className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-white px-3 shadow-sm transition',
          'border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30',
          'dark:border-slate-600 dark:bg-slate-900',
        )}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Quick add task"
          placeholder={placeholder ?? 'Add a task… e.g. "Pay rent tomorrow !high #finance @Home"'}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          disabled={createMutation.isPending}
        />
        {text ? (
          <button
            type="submit"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
          >
            Add <CornerDownLeft className="h-3 w-3" />
          </button>
        ) : (
          <span className="hidden sm:inline-flex">
            <Kbd>N</Kbd>
          </span>
        )}
      </form>

      {current && (
        <div
          data-testid="quick-add-preview"
          className="absolute left-0 right-0 top-full z-20 mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          <span className="mr-1 max-w-[40%] truncate font-medium text-slate-800 dark:text-slate-100">
            {current.title}
          </span>
          {current.project_name && (
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              @{current.project_name}
            </Badge>
          )}
          {current.priority !== 'medium' && (
            <Badge className={PRIORITY_META[current.priority].className}>
              {PRIORITY_META[current.priority].label}
            </Badge>
          )}
          {due && due.tone !== 'none' && (
            <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              {due.label}
            </Badge>
          )}
          {current.recurrence && (
            <Badge className="bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              {RECURRENCE_META[current.recurrence]}
            </Badge>
          )}
          {current.estimate_minutes ? (
            <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {formatMinutes(current.estimate_minutes)}
            </Badge>
          ) : null}
          {current.tags.map((t) => (
            <Badge
              key={t}
              className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            >
              #{t}
            </Badge>
          ))}
          {current.warnings.map((w) => (
            <span key={w} className="basis-full text-[11px] text-amber-600 dark:text-amber-400">
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

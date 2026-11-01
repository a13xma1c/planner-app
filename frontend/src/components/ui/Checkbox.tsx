import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  className?: string
  /** Round "complete task" style vs. square selection style */
  round?: boolean
  disabled?: boolean
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  round = false,
  disabled,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        round ? 'rounded-full' : 'rounded',
        checked
          ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
          : 'border-slate-300 bg-transparent text-transparent hover:border-indigo-400 dark:border-slate-600',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  )
}

import { Check, Eye, EyeOff, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import {
  evaluatePassword,
  SCORE_COLORS,
  strengthPercent,
  type PasswordContext,
  type PasswordReport,
} from '@/lib/password'
import { cn } from '@/lib/utils'

import { Input, Label } from '../ui/Input'

interface PasswordFieldProps {
  value: string
  onChange: (value: string) => void
  /**
   * Evaluation to display. Parents that need the verdict (to enable submit) compute it
   * with `evaluatePassword` and pass it in; otherwise it is computed here.
   */
  report?: PasswordReport
  /** Name/email typed so far, so "contains your name" is evaluated live. */
  context?: PasswordContext
  label?: string
  autoComplete?: 'new-password' | 'current-password'
  /** Show the strength meter + checklist (on for new passwords). */
  showStrength?: boolean
  id?: string
}

const TEXT = [
  'text-rose-600',
  'text-rose-600',
  'text-amber-600',
  'text-lime-700',
  'text-emerald-600',
]

/** Password input with a show/hide toggle and a live policy checker. */
export function PasswordField({
  value,
  onChange,
  report: given,
  context,
  label = 'Password',
  autoComplete = 'new-password',
  showStrength = true,
  id,
}: PasswordFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = useState(false)
  const computed = useMemo(
    () => (given ? null : evaluatePassword(value, context ?? {})),
    [given, value, context],
  )
  const report = given ?? computed!

  const started = value.length > 0
  const percent = strengthPercent(value, report)
  const required = report.checks.filter((c) => c.required)
  const advisory = report.checks.filter((c) => !c.required)

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label htmlFor={inputId} className="mb-0">
          {label}
        </Label>
        {/* Outside the input on purpose: password managers and Safari draw their own
            controls over the right edge of password fields and would cover an inline icon. */}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // keep focus (and the mobile keyboard) in the input
          onMouseDown={(e) => e.preventDefault()}
          aria-pressed={visible}
          aria-controls={inputId}
          data-testid="toggle-password-visibility"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          {visible ? (
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden />
          )}
          {visible ? 'Hide password' : 'Show password'}
        </button>
      </div>
      <Input
        id={inputId}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        aria-describedby={showStrength ? `${inputId}-strength` : undefined}
        aria-invalid={showStrength && started && !report.ok ? true : undefined}
        spellCheck={false}
      />

      {showStrength && (
        <div id={`${inputId}-strength`} className="mt-2 space-y-2" data-testid="password-strength">
          <div className="flex items-center gap-2">
            <div
              role="meter"
              aria-label="Password strength"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={started ? report.score : 0}
              aria-valuetext={started ? report.label : 'Not rated'}
              data-testid="password-meter"
              data-percent={percent}
              className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            >
              <div
                className="h-full rounded-full transition-[width,background-color] duration-300 ease-out"
                style={{
                  width: `${percent}%`,
                  backgroundColor: started ? SCORE_COLORS[report.score] : 'transparent',
                }}
              />
            </div>
            <span
              className={cn(
                'w-16 text-right text-xs font-medium transition-colors',
                started ? TEXT[report.score] : 'text-slate-400',
              )}
              aria-live="polite"
              data-testid="password-label"
            >
              {started ? report.label : '—'}
            </span>
          </div>

          <ul
            className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2"
            aria-label="Password requirements"
          >
            {required.map((c) => (
              <li
                key={c.id}
                data-testid={`check-${c.id}`}
                data-passed={started ? c.passed : undefined}
                className={cn(
                  'flex items-start gap-1.5',
                  !started
                    ? 'text-slate-500'
                    : c.passed
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {started ? (
                  c.passed ? (
                    <Check className="mt-0.5 h-3 w-3 shrink-0" aria-label="met" />
                  ) : (
                    <X className="mt-0.5 h-3 w-3 shrink-0" aria-label="not met" />
                  )
                ) : (
                  <span
                    className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-slate-300"
                    aria-hidden
                  />
                )}
                {c.label}
              </li>
            ))}
          </ul>

          {started && (report.suggestions.length > 0 || advisory.some((c) => !c.passed)) && (
            <ul className="space-y-0.5 text-xs text-slate-500" aria-label="Suggestions">
              {report.suggestions.map((s) => (
                <li key={s}>· {s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

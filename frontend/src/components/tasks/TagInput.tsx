import { X } from 'lucide-react'
import { useId, useState } from 'react'

import { useTags } from '@/api/queries'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  id?: string
  placeholder?: string
}

function normalise(raw: string): string {
  return raw.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-')
}

/** Chip-style tag editor with suggestions from existing tags. */
export function TagInput({ value, onChange, id, placeholder = 'Add tag…' }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const { data: tags = [] } = useTags()
  const listId = useId()

  const add = (raw: string) => {
    const name = normalise(raw)
    if (!name || value.includes(name)) {
      setDraft('')
      return
    }
    onChange([...value, name])
    setDraft('')
  }

  const suggestions = tags
    .map((t) => t.name)
    .filter((n) => !value.includes(n) && (!draft || n.includes(normalise(draft))))
    .slice(0, 8)

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1',
        'focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30',
        'dark:border-slate-600 dark:bg-slate-900',
      )}
    >
      {value.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200"
        >
          #{name}
          <button
            type="button"
            aria-label={`Remove tag ${name}`}
            onClick={() => onChange(value.filter((v) => v !== name))}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? '' : placeholder}
        aria-label="Tags"
        className="min-w-[80px] flex-1 bg-transparent py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </datalist>
    </div>
  )
}

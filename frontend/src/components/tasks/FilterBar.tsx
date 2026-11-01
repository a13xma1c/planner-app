import { ArrowDownUp, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useTags } from '@/api/queries'
import { PRIORITIES, STATUSES, type TaskSort } from '@/api/types'
import { useDebounced } from '@/lib/hooks'
import { PRIORITY_META, SORT_META, STATUS_META } from '@/lib/meta'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspaceContext'

import { Button } from '../ui/Button'
import { countActiveFilters, DEFAULT_FILTERS, type FilterState } from '@/lib/filters'

import { Input, Select } from '../ui/Input'
import { TagChip } from './badges'

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

interface FilterBarProps {
  value: FilterState
  onChange: (next: FilterState) => void
  hideStatus?: boolean
  hideAssignee?: boolean
}

export function FilterBar({
  value,
  onChange,
  hideStatus = false,
  hideAssignee = false,
}: FilterBarProps) {
  const [search, setSearch] = useState(value.search)
  const debounced = useDebounced(search, 250)
  const { data: tags = [] } = useTags()
  const { members, isShared } = useWorkspace()

  useEffect(() => {
    if (debounced !== value.search) onChange({ ...value, search: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  useEffect(() => {
    setSearch(value.search)
  }, [value.search])

  const active = countActiveFilters(value)

  return (
    <div className="mb-4 space-y-2" data-testid="filter-bar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="pl-8"
            data-testid="search-input"
          />
        </div>
        <div className="flex items-center gap-1">
          <ArrowDownUp className="h-4 w-4 text-slate-400" aria-hidden />
          <Select
            value={value.sort}
            onChange={(e) => onChange({ ...value, sort: e.target.value as TaskSort })}
            aria-label="Sort by"
            className="w-auto"
          >
            {(Object.keys(SORT_META) as TaskSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_META[s]}
              </option>
            ))}
          </Select>
          {value.sort !== 'smart' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...value, order: value.order === 'asc' ? 'desc' : 'asc' })}
              aria-label={`Order ${value.order === 'asc' ? 'ascending' : 'descending'}`}
            >
              {value.order === 'asc' ? '↑' : '↓'}
            </Button>
          )}
        </div>
        {isShared && !hideAssignee && (
          <Select
            value={value.assignee}
            onChange={(e) => onChange({ ...value, assignee: e.target.value })}
            aria-label="Filter by assignee"
            className="w-auto"
          >
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.display_name}
              </option>
            ))}
          </Select>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={value.includeDone}
            onChange={(e) => onChange({ ...value, includeDone: e.target.checked })}
            className="h-3.5 w-3.5 accent-indigo-600"
          />
          Show completed
        </label>
        {active > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...DEFAULT_FILTERS, sort: value.sort, order: value.order })}
          >
            <X className="h-3.5 w-3.5" /> Clear ({active})
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!hideStatus &&
          STATUSES.map((s) => (
            <FilterPill
              key={s}
              active={value.status.includes(s)}
              onClick={() => onChange({ ...value, status: toggle(value.status, s) })}
              className={value.status.includes(s) ? STATUS_META[s].className : undefined}
            >
              {STATUS_META[s].label}
            </FilterPill>
          ))}
        {!hideStatus && <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />}
        {PRIORITIES.map((p) => (
          <FilterPill
            key={p}
            active={value.priority.includes(p)}
            onClick={() => onChange({ ...value, priority: toggle(value.priority, p) })}
            className={value.priority.includes(p) ? PRIORITY_META[p].className : undefined}
          >
            {PRIORITY_META[p].label}
          </FilterPill>
        ))}
        {tags.length > 0 && <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />}
        {tags.map((t) => (
          <TagChip
            key={t.id}
            tag={t}
            active={value.tag.includes(t.name)}
            onClick={() => onChange({ ...value, tag: toggle(value.tag, t.name) })}
          />
        ))}
      </div>
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-transparent'
          : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** URL <-> filter-state helpers for task lists (kept separate from the component for Fast Refresh). */
import {
  PRIORITIES,
  STATUSES,
  type Priority,
  type Status,
  type TaskFilters,
  type TaskSort,
} from '@/api/types'
import { SORT_META } from '@/lib/meta'

export interface FilterState {
  search: string
  status: Status[]
  priority: Priority[]
  tag: string[]
  sort: TaskSort
  order: 'asc' | 'desc'
  includeDone: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  status: [],
  priority: [],
  tag: [],
  sort: 'smart',
  order: 'asc',
  includeDone: false,
}

export function filtersToQuery(f: FilterState): TaskFilters {
  return {
    search: f.search || undefined,
    status: f.status.length ? f.status : undefined,
    priority: f.priority.length ? f.priority : undefined,
    tag: f.tag.length ? f.tag : undefined,
    sort: f.sort,
    order: f.order,
    include_done: f.status.length ? true : f.includeDone,
  }
}

export function parseFilters(params: URLSearchParams): FilterState {
  const list = <T extends string>(key: string, allowed?: readonly T[]): T[] =>
    params.getAll(key).filter((v): v is T => !allowed || allowed.includes(v as T))
  const sort = params.get('sort') as TaskSort | null
  return {
    search: params.get('q') ?? '',
    status: list<Status>('status', STATUSES),
    priority: list<Priority>('priority', PRIORITIES),
    tag: list('tag'),
    sort: sort && sort in SORT_META ? sort : 'smart',
    order: params.get('order') === 'desc' ? 'desc' : 'asc',
    includeDone: params.get('done') === '1',
  }
}

export function filtersToParams(f: FilterState, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base)
  for (const k of ['q', 'status', 'priority', 'tag', 'sort', 'order', 'done']) p.delete(k)
  if (f.search) p.set('q', f.search)
  f.status.forEach((s) => p.append('status', s))
  f.priority.forEach((s) => p.append('priority', s))
  f.tag.forEach((s) => p.append('tag', s))
  if (f.sort !== 'smart') p.set('sort', f.sort)
  if (f.order !== 'asc') p.set('order', f.order)
  if (f.includeDone) p.set('done', '1')
  return p
}

export function countActiveFilters(f: FilterState): number {
  return (
    (f.search ? 1 : 0) +
    f.status.length +
    f.priority.length +
    f.tag.length +
    (f.includeDone ? 1 : 0)
  )
}

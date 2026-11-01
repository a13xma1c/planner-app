import { describe, expect, it } from 'vitest'

import {
  countActiveFilters,
  DEFAULT_FILTERS,
  filtersToParams,
  filtersToQuery,
  parseFilters,
} from './filters'

describe('filters', () => {
  it('parses URL params, ignoring unknown values', () => {
    const f = parseFilters(
      new URLSearchParams(
        'q=milk&status=done&status=bogus&priority=high&tag=a&tag=b&sort=title&order=desc&done=1',
      ),
    )
    expect(f).toEqual({
      search: 'milk',
      status: ['done'],
      priority: ['high'],
      tag: ['a', 'b'],
      sort: 'title',
      order: 'desc',
      includeDone: true,
      assignee: '',
    })
    expect(parseFilters(new URLSearchParams('sort=nope&order=sideways'))).toEqual(DEFAULT_FILTERS)
  })

  it('serialises back to params while preserving unrelated ones', () => {
    const base = new URLSearchParams('task=5&q=old')
    const p = filtersToParams(
      {
        ...DEFAULT_FILTERS,
        search: 'new',
        status: ['todo'],
        sort: 'priority',
        order: 'desc',
        includeDone: true,
      },
      base,
    )
    expect(p.get('task')).toBe('5')
    expect(p.get('q')).toBe('new')
    expect(p.getAll('status')).toEqual(['todo'])
    expect(p.get('sort')).toBe('priority')
    expect(p.get('order')).toBe('desc')
    expect(p.get('done')).toBe('1')
    // defaults are omitted
    expect(filtersToParams(DEFAULT_FILTERS, new URLSearchParams()).toString()).toBe('')
  })

  it('builds API queries; explicit status filters include done tasks', () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toEqual({
      search: undefined,
      status: undefined,
      priority: undefined,
      tag: undefined,
      sort: 'smart',
      order: 'asc',
      include_done: false,
      assigned_to_me: undefined,
      unassigned: undefined,
      assignee_id: undefined,
    })
    expect(filtersToQuery({ ...DEFAULT_FILTERS, assignee: 'me' }).assigned_to_me).toBe(true)
    expect(filtersToQuery({ ...DEFAULT_FILTERS, assignee: 'none' }).unassigned).toBe(true)
    expect(filtersToQuery({ ...DEFAULT_FILTERS, assignee: '42' }).assignee_id).toBe(42)
    const p = filtersToParams({ ...DEFAULT_FILTERS, assignee: 'me' }, new URLSearchParams())
    expect(p.get('assignee')).toBe('me')
    expect(parseFilters(p).assignee).toBe('me')
    expect(filtersToQuery({ ...DEFAULT_FILTERS, status: ['done'] }).include_done).toBe(true)
  })

  it('counts active filters', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0)
    expect(
      countActiveFilters({ ...DEFAULT_FILTERS, search: 'x', tag: ['a', 'b'], includeDone: true }),
    ).toBe(4)
  })
})

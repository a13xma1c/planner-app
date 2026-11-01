import { describe, expect, it } from 'vitest'

import { cn, contrastText, formatMinutes, groupBy, pluralize } from './utils'

describe('utils', () => {
  it('cn merges classes and ignores falsy values', () => {
    const hidden = false as boolean
    expect(cn('a', hidden && 'b', undefined, 'c')).toBe('a c')
    expect(cn('w-full px-2', 'w-auto')).toBe('px-2 w-auto')
  })

  it('pluralize', () => {
    expect(pluralize(1, 'task')).toBe('1 task')
    expect(pluralize(2, 'task')).toBe('2 tasks')
    expect(pluralize(0, 'entry', 'entries')).toBe('0 entries')
  })

  it.each([
    [null, ''],
    [0, ''],
    [30, '30m'],
    [60, '1h'],
    [90, '1h 30m'],
    [150, '2h 30m'],
  ])('formatMinutes(%s) = %s', (input, expected) => {
    expect(formatMinutes(input)).toBe(expected)
  })

  it('picks a readable text colour', () => {
    expect(contrastText('#ffffff')).toBe('#000000')
    expect(contrastText('#000000')).toBe('#ffffff')
    expect(contrastText('#4f46e5')).toBe('#ffffff')
    expect(contrastText('not-a-colour')).toBe('#ffffff')
  })

  it('groups items preserving insertion order', () => {
    const groups = groupBy([1, 2, 3, 4, 5], (n) => (n % 2 ? 'odd' : 'even'))
    expect([...groups.keys()]).toEqual(['odd', 'even'])
    expect(groups.get('odd')).toEqual([1, 3, 5])
  })
})

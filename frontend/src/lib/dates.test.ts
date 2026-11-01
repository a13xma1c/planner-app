import { describe, expect, it } from 'vitest'

import {
  addDaysISO,
  calendarRange,
  dayHeading,
  describeDue,
  formatDateTime,
  formatLongDate,
  parseDate,
  toISODate,
} from './dates'

const NOW = new Date(2025, 2, 12) // Wed 12 March 2025 (local)

describe('describeDue', () => {
  it.each([
    ['2025-03-12', 'Today', 'today', 0],
    ['2025-03-13', 'Tomorrow', 'soon', 1],
    ['2025-03-11', 'Yesterday', 'overdue', -1],
    ['2025-03-09', '3 days overdue', 'overdue', -3],
    ['2025-03-15', 'Saturday', 'soon', 3],
    ['2025-03-25', '25 Mar', 'later', 13],
    ['2026-01-05', '5 Jan 2026', 'later', 299],
  ])('%s -> %s', (iso, label, tone, days) => {
    expect(describeDue(iso, NOW)).toEqual({ label, tone, daysAway: days })
  })

  it('handles missing dates', () => {
    expect(describeDue(null, NOW)).toEqual({ label: '', tone: 'none', daysAway: null })
    expect(describeDue('garbage', NOW).tone).toBe('none')
  })
})

describe('date helpers', () => {
  it('round-trips ISO dates', () => {
    expect(toISODate(NOW)).toBe('2025-03-12')
    expect(parseDate('2025-03-12')?.getDate()).toBe(12)
    expect(parseDate('')).toBeNull()
    expect(parseDate('2025-13-45')).toBeNull()
  })

  it('adds days', () => {
    expect(addDaysISO(3, NOW)).toBe('2025-03-15')
    expect(addDaysISO(-12, NOW)).toBe('2025-02-28')
  })

  it('formats long dates and datetimes', () => {
    expect(formatLongDate('2025-03-12')).toBe('Wednesday, 12 March 2025')
    expect(formatLongDate(null)).toBe('')
    expect(formatDateTime('2025-03-12T09:30:00')).toMatch(/12 Mar 2025, \d{2}:\d{2}/)
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('nope')).toBe('')
  })

  it('builds day headings', () => {
    expect(dayHeading('2025-03-12', NOW)).toBe('Today · Wed 12 Mar')
    expect(dayHeading('2025-03-13', NOW)).toBe('Tomorrow · Thu 13 Mar')
    expect(dayHeading('2025-03-20', NOW)).toBe('Thursday 20 Mar')
    expect(dayHeading('bad', NOW)).toBe('bad')
  })

  it('computes a Monday-first calendar range covering the month', () => {
    const { start, end } = calendarRange(new Date(2025, 2, 1))
    expect(toISODate(start)).toBe('2025-02-24')
    expect(toISODate(end)).toBe('2025-04-06')
  })
})

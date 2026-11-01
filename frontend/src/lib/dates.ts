import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameYear,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

export const ISO_DATE = 'yyyy-MM-dd'

export function today(): Date {
  return startOfDay(new Date())
}

export function toISODate(d: Date): string {
  return format(d, ISO_DATE)
}

export function todayISO(): string {
  return toISODate(today())
}

export function addDaysISO(days: number, from: Date = today()): string {
  return toISODate(addDays(from, days))
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = parseISO(iso)
  return isValid(d) ? d : null
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none'

export interface DueInfo {
  label: string
  tone: DueTone
  daysAway: number | null
}

/** Human-friendly due-date label relative to today (e.g. "Tomorrow", "3 days overdue"). */
export function describeDue(iso: string | null | undefined, now: Date = today()): DueInfo {
  const d = parseDate(iso)
  if (!d) return { label: '', tone: 'none', daysAway: null }
  const diff = differenceInCalendarDays(d, now)
  if (diff < 0) {
    const n = -diff
    return { label: n === 1 ? 'Yesterday' : `${n} days overdue`, tone: 'overdue', daysAway: diff }
  }
  if (diff === 0) return { label: 'Today', tone: 'today', daysAway: 0 }
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon', daysAway: 1 }
  if (diff < 7) return { label: format(d, 'EEEE'), tone: 'soon', daysAway: diff }
  const label = isSameYear(d, now) ? format(d, 'd MMM') : format(d, 'd MMM yyyy')
  return { label, tone: 'later', daysAway: diff }
}

export function formatLongDate(iso: string | null | undefined): string {
  const d = parseDate(iso)
  return d ? format(d, 'EEEE, d MMMM yyyy') : ''
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = parseISO(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  return isValid(d) ? format(d, 'd MMM yyyy, HH:mm') : ''
}

/** Heading for a day bucket in the "Upcoming" view. */
export function dayHeading(iso: string, now: Date = today()): string {
  const d = parseDate(iso)
  if (!d) return iso
  const diff = differenceInCalendarDays(d, now)
  if (diff === 0) return `Today · ${format(d, 'EEE d MMM')}`
  if (diff === 1) return `Tomorrow · ${format(d, 'EEE d MMM')}`
  return format(d, 'EEEE d MMM')
}

/** Visible range of a month grid (Monday-first weeks). */
export function calendarRange(month: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }
}

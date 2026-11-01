import { useCallback, useEffect, useState } from 'react'

import type { Task } from '@/api/types'

import { useHotkeys } from './hooks'

interface Options {
  tasks: Task[]
  onOpen: (id: number) => void
  onToggleDone?: (task: Task) => void
  onToggleSelect?: (id: number) => void
  enabled?: boolean
}

/**
 * Vim-style keyboard navigation for task lists: j/k (or ↓/↑) move the cursor,
 * Enter opens, x selects, c completes/reopens. The cursor follows the mouse (hover)
 * and is dropped when its task disappears from the list.
 */
export function useListNavigation({
  tasks,
  onOpen,
  onToggleDone,
  onToggleSelect,
  enabled = true,
}: Options) {
  const [cursor, setCursor] = useState<number | null>(null)
  const ids = tasks.map((t) => t.id)
  const idsKey = ids.join(',')
  const [seenKey, setSeenKey] = useState(idsKey)

  // Adjust when the list changes: keep the cursor if the task still exists, otherwise drop it.
  if (seenKey !== idsKey) {
    setSeenKey(idsKey)
    if (cursor !== null && !ids.includes(cursor)) setCursor(null)
  }

  const move = useCallback(
    (delta: 1 | -1) => {
      if (ids.length === 0) return
      setCursor((current) => {
        const index = current === null ? -1 : ids.indexOf(current)
        const next =
          index === -1
            ? delta === 1
              ? 0
              : ids.length - 1
            : Math.min(ids.length - 1, Math.max(0, index + delta))
        return ids[next] ?? null
      })
    },
    [ids],
  )

  const current = cursor === null ? undefined : tasks.find((t) => t.id === cursor)

  useHotkeys(
    enabled
      ? [
          { combo: 'j', handler: () => move(1) },
          { combo: 'arrowdown', handler: () => move(1) },
          { combo: 'k', handler: () => move(-1) },
          { combo: 'arrowup', handler: () => move(-1) },
          { combo: 'enter', handler: () => current && onOpen(current.id) },
          { combo: 'x', handler: () => current && onToggleSelect?.(current.id) },
          { combo: 'c', handler: () => current && onToggleDone?.(current) },
        ]
      : [],
  )

  // Keep the focused row in view.
  useEffect(() => {
    if (cursor === null) return
    document.querySelector(`[data-task-id="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return { cursor, setCursor }
}

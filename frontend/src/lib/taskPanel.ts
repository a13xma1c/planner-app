import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** The task detail panel is driven by the `?task=<id>` URL param so it works on every page. */
export function useTaskPanel() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('task')
  const taskId = raw && /^\d+$/.test(raw) ? Number(raw) : null

  const open = useCallback(
    (id: number) =>
      setParams(
        (prev) => {
          prev.set('task', String(id))
          return prev
        },
        { replace: false },
      ),
    [setParams],
  )
  const close = useCallback(
    () =>
      setParams(
        (prev) => {
          prev.delete('task')
          return prev
        },
        { replace: true },
      ),
    [setParams],
  )
  return { taskId, open, close }
}

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { keys } from '@/api/queries'

/**
 * Subscribe to the workspace's Server-Sent Events stream and re-fetch whatever the
 * current screens show when somebody changes something. Reconnection is handled by
 * the browser's EventSource; the stream itself carries no data, only "changed" pings.
 */
export function useWorkspaceEvents(workspaceId: number, enabled = true): void {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    const source = new EventSource(`/api/events?workspace=${workspaceId}`)
    let timer: number | null = null
    const onChanged = (event: MessageEvent<string>) => {
      let entity = 'all'
      try {
        entity = (JSON.parse(event.data) as { entity?: string }).entity ?? 'all'
      } catch {
        /* ignore malformed frames */
      }
      // Coalesce bursts (e.g. bulk actions) into a single refetch.
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        if (entity === 'members') {
          void qc.invalidateQueries({ queryKey: keys.workspaces })
          void qc.invalidateQueries({ queryKey: keys.members(workspaceId) })
        } else {
          void qc.invalidateQueries({ queryKey: keys.ws(workspaceId) })
        }
      }, 150)
    }
    source.addEventListener('changed', onChanged as EventListener)
    return () => {
      source.removeEventListener('changed', onChanged as EventListener)
      source.close()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [qc, workspaceId, enabled])
}

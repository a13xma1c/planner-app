import { useEffect } from 'react'

/** "(3) Planner" while there is work due today/overdue, plain "Planner" otherwise. */
export function useDocumentTitle(dueCount: number | undefined, workspaceName?: string): void {
  useEffect(() => {
    const base = workspaceName ? `${workspaceName} · Planner` : 'Planner'
    document.title = dueCount ? `(${dueCount}) ${base}` : base
    return () => {
      document.title = 'Planner'
    }
  }, [dueCount, workspaceName])
}

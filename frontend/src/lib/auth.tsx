import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { UNAUTHORIZED_EVENT } from '@/api/client'
import { keys, useMe } from '@/api/queries'
import { PageLoader } from '@/components/ui/Misc'

import { nextPath } from './navigation'

/** Layout route: renders children only for signed-in users, otherwise goes to /login. */
export function RequireAuth() {
  const { data: me, isLoading, isError } = useMe()
  const location = useLocation()
  const qc = useQueryClient()

  // A 401 from any API call means the session is gone: drop cached user and re-route.
  useEffect(() => {
    const onUnauthorized = () => qc.setQueryData(keys.me, null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [qc])

  if (isLoading) return <PageLoader />
  if (isError || !me) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <Outlet />
}

/** Layout route for /login and /register: signed-in users are sent into the app. */
export function RedirectIfAuthenticated() {
  const { data: me, isLoading } = useMe()
  const location = useLocation()
  if (isLoading) return <PageLoader />
  if (me) return <Navigate to={nextPath(location.search)} replace />
  return <Outlet />
}

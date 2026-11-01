import { LogOut, Settings, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useLogout } from '@/api/queries'
import { useClickOutside } from '@/lib/hooks'
import { useWorkspace } from '@/lib/workspaceContext'

import { Avatar } from '../workspace/Avatar'

export function UserMenu() {
  const { me, path } = useWorkspace()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const logout = useLogout({ onSuccess: () => navigate('/login', { replace: true }) })
  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="user-menu"
        className="rounded-full ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:ring-offset-slate-900"
      >
        <Avatar user={me} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 px-2 py-2">
            <UserRound className="h-4 w-4 text-slate-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                {me.display_name}
              </p>
              <p className="truncate text-xs text-slate-500">{me.email}</p>
            </div>
          </div>
          <Link
            to={path('/settings')}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => logout.mutate()}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

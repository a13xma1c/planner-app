import type { UserPublic } from '@/api/types'
import { avatarColor, initials } from '@/lib/workspaceContext'
import { cn } from '@/lib/utils'

/** Initials avatar for a member. */
export function Avatar({
  user,
  size = 'sm',
  className,
}: {
  user: UserPublic
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const sizes = { xs: 'h-4 w-4 text-[8px]', sm: 'h-6 w-6 text-[10px]', md: 'h-9 w-9 text-sm' }
  return (
    <span
      title={user.display_name}
      aria-label={user.display_name}
      role="img"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: avatarColor(user.id) }}
    >
      {initials(user.display_name)}
    </span>
  )
}

export function AssigneeChip({ user }: { user: UserPublic | null }) {
  if (!user) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
      <Avatar user={user} size="xs" />
      {user.display_name}
    </span>
  )
}

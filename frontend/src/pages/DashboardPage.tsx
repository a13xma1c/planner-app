import { AlertTriangle, CheckCircle2, Flame, ListTodo, Sun, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useOverview, useTasks, useUpcoming } from '@/api/queries'
import { PRIORITIES } from '@/api/types'
import { ActivityChart, Card, ProjectProgressList, StatCard } from '@/components/dashboard/widgets'
import { TaskList } from '@/components/tasks/TaskList'
import { useTaskActions } from '@/components/tasks/useTaskActions'
import { ErrorState, PageHeader, PageLoader } from '@/components/ui/Misc'
import { toISODate } from '@/lib/dates'
import { PRIORITY_META } from '@/lib/meta'
import { useTaskPanel } from '@/lib/taskPanel'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

export function DashboardPage() {
  const [now] = useState(() => new Date())
  const today = toISODate(now)
  const { data: stats, isLoading, error, refetch } = useOverview()
  const { data: focus = [] } = useTasks({ due_to: today, include_done: false, limit: 8 })
  const { data: upcoming = [] } = useUpcoming(7)
  const { open } = useTaskPanel()
  const { toggleDone } = useTaskActions()

  if (isLoading) return <PageLoader />
  if (error || !stats) return <ErrorState error={error} retry={() => refetch()} />

  const h = now.getHours()
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const openPriorities = PRIORITIES.map((p) => ({ p, n: stats.by_priority[p] }))
  const priorityTotal = openPriorities.reduce((a, b) => a + b.n, 0)
  const soon = upcoming.filter((t) => t.due_date && t.due_date > today).slice(0, 6)

  return (
    <div>
      <PageHeader title={greeting} subtitle={format(now, 'EEEE, d MMMM yyyy')} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={ListTodo}
          label="Open"
          value={stats.open}
          hint={`${stats.total} total`}
          to="/tasks"
        />
        <StatCard icon={Sun} label="Due today" value={stats.due_today} to="/today" tone="warning" />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={stats.overdue}
          to="/today"
          tone={stats.overdue ? 'danger' : 'default'}
        />
        <StatCard
          icon={CheckCircle2}
          label="Done this week"
          value={stats.completed_last_7_days}
          hint={`${stats.completed_today} today`}
          tone="success"
        />
        <StatCard
          icon={Flame}
          label="Streak"
          value={`${stats.streak_days}d`}
          hint="days with completions"
        />
        <StatCard
          icon={TrendingUp}
          label="Completion"
          value={`${Math.round(stats.completion_rate * 100)}%`}
          hint="of all tasks"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Focus for today"
          className="lg:col-span-2"
          action={
            <Link
              to="/today"
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              View all
            </Link>
          }
        >
          <TaskList
            tasks={focus}
            onOpen={open}
            onToggleDone={toggleDone}
            emptyTitle="Nothing due today"
            emptyDescription="Enjoy the calm, or pull something in from Upcoming."
          />
        </Card>

        <div className="space-y-4">
          <Card title="Activity · 14 days">
            <ActivityChart completed={stats.completed_series} created={stats.created_series} />
          </Card>
          <Card title="Open by priority">
            {priorityTotal === 0 ? (
              <p className="text-sm text-slate-500">No open tasks.</p>
            ) : (
              <>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  {openPriorities.map(({ p, n }) => (
                    <div
                      key={p}
                      className={cn(PRIORITY_META[p].dot)}
                      style={{ width: `${(n / priorityTotal) * 100}%` }}
                      title={`${PRIORITY_META[p].label}: ${n}`}
                    />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-1 text-xs">
                  {openPriorities.map(({ p, n }) => (
                    <li key={p}>
                      <Link
                        to={`/tasks?priority=${p}`}
                        className="flex items-center gap-1.5 text-slate-600 hover:underline dark:text-slate-300"
                      >
                        <span className={cn('h-2 w-2 rounded-full', PRIORITY_META[p].dot)} />
                        {PRIORITY_META[p].label}
                        <span className="ml-auto tabular-nums text-slate-400">{n}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <Card title="Projects" className="lg:col-span-2">
          <ProjectProgressList projects={stats.projects} />
        </Card>

        <Card
          title="Coming up"
          action={
            <Link
              to="/upcoming"
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Next 7 days
            </Link>
          }
        >
          <TaskList
            tasks={soon}
            onOpen={open}
            onToggleDone={toggleDone}
            emptyTitle="Nothing scheduled"
            emptyDescription="Tasks due in the next week will show here."
          />
        </Card>
      </div>
    </div>
  )
}

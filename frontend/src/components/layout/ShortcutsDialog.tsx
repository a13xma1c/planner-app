import { Kbd } from '../ui/Badge'
import { Dialog } from '../ui/Dialog'

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'General',
    items: [
      [['N'], 'Focus quick add'],
      [['Shift', 'N'], 'New task form'],
      [['/'], 'Focus search'],
      [['?'], 'Show this help'],
      [['Esc'], 'Close panel / dialog'],
    ],
  },
  {
    title: 'Navigate (press G, then…)',
    items: [
      [['G', 'D'], 'Dashboard'],
      [['G', 'I'], 'Inbox'],
      [['G', 'T'], 'Today'],
      [['G', 'U'], 'Upcoming'],
      [['G', 'A'], 'All tasks'],
      [['G', 'B'], 'Board'],
      [['G', 'C'], 'Calendar'],
    ],
  },
  {
    title: 'Quick add syntax',
    items: [
      [['#tag'], 'Add a tag'],
      [['@Project'], 'Assign to a project (@"Two words")'],
      [['!high', 'p1'], 'Priority (urgent/high/medium/low or p1–p4)'],
      [['~1h30m'], 'Time estimate'],
      [['tomorrow', 'fri', 'mar 5'], 'Due date (also: in 3 days, next week, eom)'],
      [['daily', 'every friday'], 'Recurrence (weekly, monthly, yearly…)'],
    ],
  },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts & syntax" size="lg">
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {g.title}
            </h3>
            <ul className="space-y-1.5">
              {g.items.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}

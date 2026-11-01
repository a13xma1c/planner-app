import { Download, Monitor, Moon, Sun, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { downloadExport, useHealth, useImportBundle, useImportLegacy } from '@/api/queries'
import type { ImportResult } from '@/api/types'
import { Card } from '@/components/dashboard/widgets'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/toastContext'
import { useTheme, type Theme } from '@/lib/themeContext'
import { cn } from '@/lib/utils'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text()
  return JSON.parse(text) as unknown
}

function describeImport(r: ImportResult): string {
  return `${r.tasks} tasks, ${r.projects} projects, ${r.tags} tags${r.skipped ? ` · ${r.skipped} skipped` : ''}`
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const { data: health } = useHealth()
  const [pendingReplace, setPendingReplace] = useState<unknown | null>(null)
  const [exporting, setExporting] = useState(false)
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)
  const bundleInput = useRef<HTMLInputElement>(null)
  const legacyInput = useRef<HTMLInputElement>(null)

  const onImported = (r: ImportResult) => {
    setLastResult(r)
    toast.success('Import finished', describeImport(r))
  }
  const importBundle = useImportBundle({
    onSuccess: onImported,
    onError: (e) => toast.error('Import failed', e.message),
  })
  const importLegacy = useImportLegacy({
    onSuccess: onImported,
    onError: (e) => toast.error('Import failed', e.message),
  })

  const pick = async (input: HTMLInputElement | null, handler: (data: unknown) => void) => {
    const file = input?.files?.[0]
    if (!file) return
    try {
      handler(await readJsonFile(file))
    } catch {
      toast.error('Invalid file', 'Expected a JSON file.')
    } finally {
      if (input) input.value = ''
    }
  }

  const onExport = async () => {
    setExporting(true)
    try {
      await downloadExport()
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : undefined)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />

      <Card title="Appearance">
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                theme === value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Backup & restore">
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>Download everything (projects, tags, tasks, checklists) as a JSON file.</p>
            <Button
              variant="outline"
              onClick={onExport}
              loading={exporting}
              data-testid="export-button"
            >
              <Download className="h-4 w-4" /> Export JSON
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p>
              Restore from an export. <strong>Merge</strong> keeps existing data;{' '}
              <strong>Replace</strong> wipes it first.
            </p>
            <div className="flex gap-2">
              <input
                ref={bundleInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                data-testid="import-bundle-input"
                onChange={() =>
                  pick(bundleInput.current, (data) => {
                    if (bundleInput.current?.dataset.mode === 'replace') setPendingReplace(data)
                    else importBundle.mutate({ bundle: data, replace: false })
                  })
                }
              />
              <Button
                variant="outline"
                loading={importBundle.isPending}
                onClick={() => {
                  if (bundleInput.current) {
                    bundleInput.current.dataset.mode = 'merge'
                    bundleInput.current.click()
                  }
                }}
              >
                <Upload className="h-4 w-4" /> Import (merge)
              </Button>
              <Button
                variant="danger"
                loading={importBundle.isPending}
                onClick={() => {
                  if (bundleInput.current) {
                    bundleInput.current.dataset.mode = 'replace'
                    bundleInput.current.click()
                  }
                }}
              >
                Import (replace)
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p>
              Migrating from the old command-line planner? Import its{' '}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">planner_data.json</code>
              .
            </p>
            <input
              ref={legacyInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="import-legacy-input"
              onChange={() => pick(legacyInput.current, (data) => importLegacy.mutate(data))}
            />
            <Button
              variant="outline"
              loading={importLegacy.isPending}
              onClick={() => legacyInput.current?.click()}
            >
              <Upload className="h-4 w-4" /> Import legacy file
            </Button>
          </div>
          {lastResult && (
            <div
              className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900"
              data-testid="import-result"
            >
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Last import: {describeImport(lastResult)}
              </p>
              {lastResult.warnings.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-amber-700 dark:text-amber-400">
                  {lastResult.warnings.slice(0, 10).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {lastResult.warnings.length > 10 && (
                    <li>…and {lastResult.warnings.length - 10} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title="About">
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          <dt>Version</dt>
          <dd data-testid="app-version">{health?.version ?? '…'}</dd>
          <dt>Database</dt>
          <dd>{health?.database || 'in-memory'}</dd>
          <dt>API docs</dt>
          <dd>
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              /api/docs
            </a>
          </dd>
        </dl>
      </Card>

      <ConfirmDialog
        open={pendingReplace !== null}
        onClose={() => setPendingReplace(null)}
        onConfirm={() => {
          importBundle.mutate({ bundle: pendingReplace, replace: true })
          setPendingReplace(null)
        }}
        title="Replace all data?"
        message="Every existing project, tag and task will be deleted before importing. Consider exporting first."
        confirmLabel="Replace everything"
      />
    </div>
  )
}

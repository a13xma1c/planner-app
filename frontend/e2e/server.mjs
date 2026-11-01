/**
 * Starts the backend for E2E tests:
 *  1. builds the frontend (skipped when dist/ exists and E2E_SKIP_BUILD=1),
 *  2. launches `planner serve` with a throw-away SQLite database.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const frontend = resolve(here, '..')
const backend = resolve(frontend, '..', 'backend')
const port = process.argv[2] ?? '8787'

if (!(process.env.E2E_SKIP_BUILD && existsSync(join(frontend, 'dist', 'index.html')))) {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: frontend,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const dataDir = mkdtempSync(join(tmpdir(), 'planner-e2e-'))
const env = {
  ...process.env,
  PLANNER_DATABASE_URL: `sqlite+aiosqlite:///${join(dataDir, 'e2e.db')}`,
  PLANNER_FRONTEND_DIST: join(frontend, 'dist'),
  PLANNER_HOST: '127.0.0.1',
  PLANNER_PORT: port,
}

// Prefer the project venv; fall back to `uv run`.
const venvBin = join(backend, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin')
const venvPython = join(venvBin, process.platform === 'win32' ? 'python.exe' : 'python')
const [cmd, args] = existsSync(venvPython)
  ? [venvPython, ['-m', 'planner', 'serve']]
  : ['uv', ['run', '--project', backend, 'planner', 'serve']]

console.warn(`[e2e] starting backend on :${port} (db: ${dataDir})`)
const child = spawn(cmd, args, { cwd: backend, env, stdio: 'inherit' })
const stop = () => child.kill('SIGTERM')
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', (code) => process.exit(code ?? 0))

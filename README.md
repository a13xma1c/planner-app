# Planner

A fast, keyboard-friendly personal task planner with a modern web UI.

Originally a small terminal app, Planner is now a full application: a **FastAPI + SQLite**
backend exposing a typed REST API, and a **React + TypeScript** single-page frontend with a
dashboard, list, Kanban board and calendar views. Everything runs locally — one command
starts the API and serves the UI.

## Features

- **Tasks** with notes, priority (urgent / high / medium / low), status (to do / in progress / done),
  due date, time estimate, tags, checklists (subtasks) and recurrence
  (daily, weekdays, weekly, every 2 weeks, monthly, yearly). Completing a recurring task
  automatically schedules the next occurrence — skipping past dates if it was overdue.
- **Natural-language quick add** with live preview:
  `Pay rent tomorrow !high #finance @Home ~1h`, `Weekly review every friday`, `Taxes mar 5 p1`.
- **Views**: Dashboard (stats, 14-day activity, priority breakdown, project progress, streak),
  Inbox, Today (with overdue), Upcoming (grouped by day), All tasks, per-project lists,
  **Kanban board** (drag & drop between columns and reorder), **Calendar** (drag to reschedule).
- **Filtering & search**: full-text search, status / priority / tag filters, seven sort orders,
  all reflected in the URL so views are shareable and survive reloads.
- **Bulk actions**: multi-select to complete, reprioritise, move, reschedule, tag or delete.
- **Projects** with colours, descriptions, progress and archiving; **tags** with colours and counts.
- **Keyboard shortcuts**: `N` quick add, `Shift+N` full form, `/` search, `G` then `B`/`C`/`T`… to
  navigate, `?` for help.
- **Dark mode** (light / dark / system), responsive layout, accessible dialogs and controls.
- **Backup & restore**: export/import JSON bundles (merge or replace), and a one-click importer
  for the original CLI's `planner_data.json`.
- **API docs** at `/api/docs` (OpenAPI), plus a small CLI (`planner serve|migrate|import|export|list`).

## Quick start

Requirements: **Python 3.12+** with [uv](https://docs.astral.sh/uv/), and **Node 20+**.

```bash
make install      # backend deps (uv) + frontend deps (npm)
make serve        # builds the frontend, then serves everything at http://127.0.0.1:8000
```

For development with hot reload (API on :8000, Vite dev server on :5173 proxying `/api`):

```bash
make dev
```

Data is stored in `~/.planner/planner.db` by default (see [Configuration](#configuration)).
Database migrations run automatically on start-up.

### Migrating from the CLI version

If you used the original terminal app, import its data file:

```bash
cd backend && uv run planner import-legacy /path/to/planner_data.json
```

or use **Settings → Import legacy file** in the UI. Projects, priorities, statuses, due dates and
notes are preserved; the legacy "Inbox" project maps to the built-in Inbox.

## Quick-add syntax

| Token                          | Meaning                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `#tag`                         | add a tag (several allowed)                                     |
| `@Project` / `@"Two Words"`    | assign to an existing project                                   |
| `!urgent` `!high` `!low`, `p1`–`p4` | priority                                                   |
| `~30m` `~2h` `~1h30m`          | time estimate                                                   |
| `today` `tomorrow` `fri` `next monday` `in 3 days` `next week` `eom` `mar 5` `2025-03-14` | due date |
| `daily` `every weekday` `weekly` `every 2 weeks` `monthly` `yearly` `every friday`          | recurrence |

Everything else becomes the title. The parser lives in `backend/planner/services/quick_add.py`
and is exhaustively unit-tested; a dry-run endpoint powers the live preview.

## Architecture

```
backend/                      Python package `planner` (FastAPI, SQLAlchemy 2 async, Pydantic v2)
  planner/
    main.py                   app factory, error mapping, SPA hosting
    api/                      thin HTTP layer (routers per resource)
    services/                 business logic: tasks, projects, tags, stats, quick_add, recurrence, transfer
    models.py                 ORM models          schemas.py   API contract (Pydantic)
    db.py                     engine/session + Alembic runner   alembic/   migrations
    cli.py                    Typer CLI
  tests/                      pytest (unit + API + CLI + migration tests)

frontend/                     React 19 + TypeScript + Vite + Tailwind CSS v4
  src/
    api/                      typed fetch client, TanStack Query hooks, TS types mirroring the schemas
    components/               ui primitives, tasks, board (dnd-kit), calendar, layout, projects
    pages/                    one component per route
    lib/                      dates, filters, hooks, theme, url-state
    test/                     Vitest setup, MSW handlers + in-memory fake API, render helpers
  e2e/                        Playwright tests against the real backend + built frontend
```

Design notes:

- **Services never touch HTTP.** Routers validate input (Pydantic), call a service with an
  `AsyncSession`, and serialise the result. Domain errors (`NotFoundError`, `ConflictError`,
  `ValidationError`) are mapped to 404 / 409 / 422 in one exception handler.
- **The Inbox is the absence of a project** (`project_id IS NULL`); deleting a project moves its
  tasks there via `ON DELETE SET NULL`.
- **Server state lives in TanStack Query**, view state in the URL (filters, selected task
  `?task=ID`, calendar month), and only ephemeral UI state in React.
- **Migrations are the schema source of truth**; a test asserts that the Alembic head matches the ORM
  models so drift fails CI.

## API overview

| Method & path                        | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `GET /api/tasks`                     | list with filters: `project_id`, `inbox`, `status`, `priority`, `tag`, `search`, `due_from`, `due_to`, `overdue`, `include_done`, `sort`, `order`, `limit` |
| `POST /api/tasks`                    | create (tags and subtasks inline)                          |
| `GET/PATCH/DELETE /api/tasks/{id}`   | read / partial update / delete                             |
| `POST /api/tasks/{id}/complete`      | complete; returns the spawned occurrence for recurring tasks |
| `POST /api/tasks/{id}/reopen`        | reopen                                                     |
| `POST /api/tasks/quick-add`          | natural-language create (`dry_run` for preview)            |
| `POST /api/tasks/bulk`               | complete / reopen / delete / set_status / set_priority / move_to_project / set_due_date / add_tag |
| `POST /api/tasks/reorder`            | board ordering (also changes status)                       |
| `GET /api/tasks/upcoming`            | open tasks due in the next N days                          |
| `/api/tasks/{id}/subtasks`, `/api/subtasks/{id}` | checklist items                                |
| `/api/projects`, `/api/tags`         | CRUD with task counts                                      |
| `GET /api/stats/overview`            | dashboard statistics                                       |
| `GET /api/data/export`, `POST /api/data/import[?replace=true]`, `POST /api/data/import/legacy` | backup / restore |
| `GET /api/health`, `GET /api/docs`   | health check, interactive docs                             |

## Configuration

All settings are environment variables prefixed with `PLANNER_` (a `backend/.env` file is also read):

| Variable                 | Default                              | Description                         |
| ------------------------ | ------------------------------------ | ----------------------------------- |
| `PLANNER_DATA_DIR`       | `~/.planner`                         | Directory for the SQLite database   |
| `PLANNER_DATABASE_URL`   | `sqlite+aiosqlite:///<data_dir>/planner.db` | Any async SQLAlchemy URL      |
| `PLANNER_HOST` / `PLANNER_PORT` | `127.0.0.1` / `8000`          | Bind address                        |
| `PLANNER_FRONTEND_DIST`  | `frontend/dist`                      | Built SPA to serve at `/`           |
| `PLANNER_CORS_ORIGINS`   | `["http://localhost:5173", …]`       | Dev-server origins                  |
| `PLANNER_DEBUG`          | `false`                              | SQL echo + debug logging            |

## Testing

```bash
make test           # backend (pytest, parallel, coverage) + frontend (vitest)
make test-e2e       # Playwright browser tests (builds the UI, boots the API on a temp DB)
make lint           # ruff + mypy --strict, oxlint + prettier + tsc
```

| Suite                         | Tool                                   | What it covers                                                    |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `backend/tests/unit`          | pytest                                 | quick-add parser (100+ cases), recurrence maths, schema validation |
| `backend/tests/api`           | pytest + httpx (ASGI, in-memory SQLite)| every endpoint: filtering/sorting, recurrence on completion, bulk ops, reorder, import/export, error mapping, SPA hosting |
| `backend/tests/test_cli.py`   | Typer `CliRunner`                      | CLI commands end-to-end                                           |
| `backend/tests/test_migrations.py` | Alembic                           | migrations apply cleanly and match the models                     |
| `frontend/src/**/*.test.tsx`  | Vitest + Testing Library + MSW         | components and pages against an in-memory fake of the API        |
| `frontend/e2e`                | Playwright                             | real browser: quick add, detail panel, drag & drop on board/calendar, filters, bulk actions, shortcuts, theme, import/export |

Backend coverage is ~99 % (enforced ≥ 85 %); the frontend unit suite reports ~85 % with the remaining
drag-and-drop paths exercised by the E2E suite. CI (`.github/workflows/ci.yml`) runs all of it.

## Development notes

- `make format` auto-formats both halves; `.pre-commit-config.yaml` wires the same checks into git.
- Adding a model field: edit `models.py` + `schemas.py`, then
  `cd backend && uv run alembic revision --autogenerate -m "..."`; the migration test will tell you
  if you forgot.
- Adding an endpoint: service function → router → `frontend/src/api/types.ts` + `queries.ts`
  → MSW handler in `frontend/src/test/server.ts` so component tests can use it.

## License

MIT

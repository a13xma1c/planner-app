# Planner

A fast, keyboard-friendly task planner with a modern web UI — for yourself, and for the
people you plan with.

Originally a small terminal app, Planner is now a full application: a **FastAPI + SQLite**
backend exposing a typed REST API, and a **React + TypeScript** single-page frontend with a
dashboard, list, Kanban board and calendar views. Every account gets a private planner and can
create **shared planners** with invite links, roles, assignees, comments and live updates.
Everything runs on one server — one command starts the API and serves the UI.

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
  navigate, `J`/`K`/`Enter`/`X`/`C` to move through, open, select and complete tasks in any list,
  `?` for help. Completing is optimistic; deleting offers **Undo**; due dates have
  Today / Tomorrow / Next week shortcuts; the board has "Add task" in every column.
- **Dark mode** (light / dark / system), responsive layout, accessible dialogs and controls.
- **Shared planners**: create a planner for your family or team, invite people with expiring
  links (optionally locked to an email), and give each member a role — *owner*, *editor* or
  read-only *viewer*. Assign tasks to members, see everyone's load on the dashboard, filter by
  "Assigned to me", and discuss in per-task comments. Changes made by others appear live.
- **Accounts**: email + password sign-in with secure cookie sessions; sign out other devices;
  registration can be switched off to make an instance invite-only. Passwords are checked
  against a real policy with live feedback while you type (see [Password policy](#password-policy)).
- **Backup & restore**: export/import JSON bundles per planner (merge or replace), and a
  one-click importer for the original CLI's `planner_data.json`.
- **API docs** at `/api/docs` (OpenAPI), plus a small CLI (`planner serve|migrate|import|export|list`).

## Quick start

Requirements: **Python 3.12+** with [uv](https://docs.astral.sh/uv/), and **Node 20+**.

```bash
make install      # backend deps (uv) + frontend deps (npm)
make serve        # builds the frontend, then serves everything at http://127.0.0.1:8000
```

Open the address, **create your account**, and you're in your personal planner. To plan with
others, use the planner switcher (top of the sidebar) → *New shared planner* → *Members* →
*Create link*, and send the link to whoever should join. They sign up (or in) and accept.

For development with hot reload (API on :8000, Vite dev server on :5173 proxying `/api`):

```bash
make dev
```

Data is stored in `~/.planner/planner.db` by default (see [Configuration](#configuration)).
Database migrations run automatically on start-up. Accounts can also be created from the
terminal (`cd backend && uv run planner create-user you@example.com --name You`), which is
the way in when `PLANNER_ALLOW_REGISTRATION=false`.

### Migrating from the CLI version

If you used the original terminal app, import its data file:

```bash
cd backend && uv run planner import-legacy /path/to/planner_data.json --user you@example.com
```

or use **Settings → Import legacy file** in the UI. Projects, priorities, statuses, due dates and
notes are preserved; the legacy "Inbox" project maps to the built-in Inbox.

Upgrading an existing single-user installation of this web app is automatic: the migration moves
the existing data into a planner that the **first account to register** becomes the owner of.

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

## Sharing model

| Concept        | Details                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| **Workspace**  | A planner: its own projects, tags and tasks. Each user owns one *personal* workspace (cannot be shared or deleted) and may create any number of shared ones. |
| **Roles**      | *Viewer* reads; *editor* changes tasks, projects, tags and comments; *owner* additionally manages members, invitations and the planner itself. A planner always keeps at least one owner. |
| **Invitations**| Links like `/join/<token>` with a role, an expiry (1–90 days), optional max uses and optional email lock. Owners can revoke them at any time. |
| **Assignees**  | Tasks can be assigned to a member; recurring tasks keep their assignee. "Assigned to me", per-member filters and the dashboard's *Team load* build on this. |
| **Comments**   | Per-task threads; authors edit their own comments, owners can delete any.                |
| **Live updates** | Every mutation publishes a `changed` event on a per-workspace Server-Sent Events stream (`GET /api/events`); open tabs re-fetch what they show. |
| **Privacy**    | Non-members receive `404` for a workspace (its existence is not revealed); viewers receive `403` on mutations. |

Requests select the workspace with the `X-Workspace-Id` header (the personal one is the default),
so the task/project/tag endpoints keep the same shape whether or not you share.

## Deployment notes

- Put the app behind TLS and set `PLANNER_SECURE_COOKIES=true`; set `PLANNER_TRUST_PROXY_HEADERS=true`
  only if a proxy you control sets `X-Forwarded-For` (otherwise clients could spoof it to dodge
  rate limits).
- Responses carry `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`, and a Content-Security-Policy for the SPA (`default-src 'self'`; the inline
  theme bootstrap in `index.html` is allow-listed by hash at start-up). State-changing `/api`
  requests from another site are refused (`Sec-Fetch-Site` / `Origin` check) in addition to the
  `SameSite=Lax` cookie.
- SQLite runs in WAL mode with a 5 s busy timeout, which is comfortable for a handful of
  collaborators. `/api/health` returns `503` when the database stops answering.
- The rate limiter is in-process; with several worker processes, put limiting in the reverse proxy
  instead. A container image is a reasonable next step but isn't included here.

## Password policy

Following NIST SP 800-63B, the policy favours length and blocklists over composition rules.
A password is accepted when every **requirement** holds and the advisory **strength** is at
least *Fair*:

| Requirement | Catches |
| --- | --- |
| 10–128 characters | `short`, 129+ chars |
| Not a commonly used password | `password123`, padded variants (`Password2024!`), leetspeak (`P@ssw0rd`), and passwords made only of common words (`dragon-master-2030`) |
| Doesn't contain your name or email | `Ann-Lee-2030` for Ann Lee, `ann.lee…`, the email's local-part tokens |
| No long runs / too few distinct characters | `aaaaaaaaaa`, `abababab` |
| No predictable sequences | `abcd`, `1234`, `4321`, `qwerty` (and reversed) |
| No leading/trailing spaces | accidental padding |

Strength (0–4: *Very weak* → *Strong*) is scored from length (10 / 14 / 20+), character variety
and distinct characters; any failed requirement caps it at *Weak*, a common password scores 0.
Suggestions nudge towards passphrases.

The sign-up and change-password forms show a meter, a ✓/✗ checklist and suggestions as you
type, and keep the submit button disabled until the policy passes. The rules live in
`backend/planner/services/passwords.py` (authoritative; also exposed as
`POST /api/auth/password/check`) and are mirrored in `frontend/src/lib/password.ts`; the shared
fixture `backend/tests/fixtures/password_cases.json` is run by **both** test suites so the two can't
drift. The blocklist is `backend/planner/data/common_passwords.txt` — add entries there and run
`make password-list` to regenerate the frontend copy (a test fails if you forget).

## Architecture

```
backend/                      Python package `planner` (FastAPI, SQLAlchemy 2 async, Pydantic v2)
  planner/
    main.py                   app factory, error mapping, SPA hosting
    api/                      thin HTTP layer (routers per resource)
    services/                 business logic: auth, workspaces, tasks, projects, tags, comments, stats,
                              quick_add, recurrence, transfer, events (SSE broadcaster)
    models.py                 ORM models          schemas.py   API contract (Pydantic)
    db.py                     engine/session + Alembic runner   alembic/   migrations
    cli.py                    Typer CLI
  tests/                      pytest (unit + API + CLI + migration tests)

frontend/                     React 19 + TypeScript + Vite + Tailwind CSS v4
  src/
    api/                      typed fetch client, TanStack Query hooks, TS types mirroring the schemas
    components/               ui primitives, tasks, board (dnd-kit), calendar, layout, projects, workspace, auth
    pages/                    one component per route (incl. login/register/join/members)
    lib/                      auth gates, workspace context, live events, dates, filters, hooks, theme, url-state
    test/                     Vitest setup, MSW handlers + in-memory fake API, render helpers
  e2e/                        Playwright tests against the real backend + built frontend
```

Design notes:

- **Services never touch HTTP.** Routers validate input (Pydantic), call a service with an
  `AsyncSession`, and serialise the result. Domain errors (`UnauthorizedError`, `ForbiddenError`,
  `NotFoundError`, `ConflictError`, `ValidationError`) are mapped to 401 / 403 / 404 / 409 / 422
  in one exception handler.
- **Authorisation is a dependency.** `ViewerCtx` / `EditorCtx` / `OwnerCtx` resolve the session
  cookie, the `X-Workspace-Id` header and the caller's membership; every service call receives the
  workspace id, so data from other planners is unreachable by construction.
- **Sessions** are random tokens stored hashed (SHA-256) in the database, sent as an `HttpOnly`,
  `SameSite=Lax` cookie with a sliding 30-day expiry. Passwords use Argon2id (`pwdlib`).
- **The Inbox is the absence of a project** (`project_id IS NULL`); deleting a project moves its
  tasks there via `ON DELETE SET NULL`.
- **Server state lives in TanStack Query** (every key is prefixed with the workspace id), view
  state in the URL (`/w/<workspace>/…`, filters, selected task `?task=ID`, calendar month), and
  only ephemeral UI state in React. A `WorkspaceLayout` route verifies membership, provides role
  helpers (`canEdit`, `isOwner`) and subscribes to the event stream.
- **Migrations are the schema source of truth**; a test asserts that the Alembic head matches the ORM
  models so drift fails CI.

## API overview

All endpoints except `/api/health`, `/api/auth/register|login` and invitation previews require a
session cookie. Workspace-scoped endpoints read `X-Workspace-Id` (default: personal planner).

| Method & path                        | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `POST /api/auth/register`, `/login`, `/logout` | accounts & sessions (cookie)                     |
| `POST /api/auth/password/check`      | evaluate a candidate password against the policy (public) |
| `GET/PATCH /api/auth/me`, `POST /api/auth/password`, `GET /api/auth/sessions`, `POST /api/auth/sessions/revoke-others` | profile, password, devices |
| `GET/POST /api/workspaces`, `GET/PATCH/DELETE /api/workspaces/current` | your planners / the selected one |
| `GET /api/workspaces/current/members`, `PATCH/DELETE …/members/{user_id}` | roles, removal, leaving |
| `GET/POST /api/workspaces/current/invitations`, `DELETE …/invitations/{id}` | invite links (owners) |
| `GET /api/invitations/{token}`, `POST …/accept` | preview / join                                  |
| `GET /api/events`                    | Server-Sent Events stream of changes (`?workspace=` for EventSource) |
| `GET /api/tasks`                     | list with filters: `project_id`, `inbox`, `status`, `priority`, `tag`, `search`, `due_from`, `due_to`, `overdue`, `assignee_id`, `assigned_to_me`, `unassigned`, `include_done`, `sort`, `order`, `limit` |
| `POST /api/tasks`                    | create (tags and subtasks inline)                          |
| `GET/PATCH/DELETE /api/tasks/{id}`   | read / partial update / delete                             |
| `POST /api/tasks/{id}/complete`      | complete; returns the spawned occurrence for recurring tasks |
| `POST /api/tasks/{id}/reopen`        | reopen                                                     |
| `POST /api/tasks/quick-add`          | natural-language create (`dry_run` for preview)            |
| `POST /api/tasks/bulk`               | complete / reopen / delete / set_status / set_priority / move_to_project / set_due_date / add_tag / assign |
| `POST /api/tasks/reorder`            | board ordering (also changes status)                       |
| `GET /api/tasks/upcoming`            | open tasks due in the next N days                          |
| `/api/tasks/{id}/subtasks`, `/api/subtasks/{id}` | checklist items                                |
| `/api/tasks/{id}/comments[/{id}]`    | comments                                                   |
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
| `PLANNER_ALLOW_REGISTRATION` | `true`                           | Allow sign-ups. The first account is always allowed; set to `false` afterwards for an invite-only instance (use `planner create-user` to add people). |
| `PLANNER_SECURE_COOKIES` | `false`                              | Mark the session cookie `Secure` and send HSTS — enable when serving over HTTPS. |
| `PLANNER_RATE_LIMIT_ENABLED` | `true`                           | Throttle sign-in / sign-up / password-check attempts (`429` + `Retry-After`). |
| `PLANNER_LOGIN_ATTEMPTS_PER_MINUTE` | `10`                      | Per client IP. |
| `PLANNER_LOGIN_ATTEMPTS_PER_EMAIL_PER_15MIN` | `20`             | Per account (cleared by a successful sign-in). |
| `PLANNER_REGISTER_ATTEMPTS_PER_HOUR` | `20`                     | Per client IP. |
| `PLANNER_TRUST_PROXY_HEADERS` | `false`                         | Read the client IP from `X-Forwarded-For` — only behind a proxy you control. |
| `PLANNER_MAINTENANCE_INTERVAL_SECONDS` | `3600`                 | How often expired sessions and stale invitations are purged (also at start-up; `0` = start-up only). |

## Testing

```bash
make test           # backend (pytest, parallel, coverage) + frontend (vitest)
make test-e2e       # Playwright browser tests (builds the UI, boots the API on a temp DB)
make lint           # ruff + mypy --strict, oxlint + prettier + tsc
```

| Suite                         | Tool                                   | What it covers                                                    |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `backend/tests/unit`          | pytest                                 | quick-add parser (100+ cases), recurrence maths, schema validation |
| `backend/tests/api`           | pytest + httpx (ASGI, in-memory SQLite)| every endpoint: auth & sessions, workspaces/roles/invitations, scoping & privacy, comments, SSE (against a real uvicorn), filtering/sorting, recurrence, bulk ops, import/export, SPA hosting |
| `backend/tests/test_cli.py`   | Typer `CliRunner`                      | CLI commands end-to-end                                           |
| `backend/tests/test_migrations.py` | Alembic                           | migrations apply cleanly and match the models                     |
| `frontend/src/**/*.test.tsx`  | Vitest + Testing Library + MSW         | components and pages against an in-memory fake of the API        |
| `frontend/e2e`                | Playwright                             | real browser: sign-up/sign-in, quick add, detail panel, drag & drop on board/calendar, filters, bulk actions, shortcuts, theme, import/export, and two-browser sharing scenarios (invite → join → live updates, viewer read-only, leaving/revoking) |

Backend coverage is ~99 % (enforced ≥ 85 %); the frontend unit suite reports ~87 % with the remaining
drag-and-drop paths exercised by the E2E suite. CI (`.github/workflows/ci.yml`) runs all of it.

## Development notes

- `make format` auto-formats both halves; `.pre-commit-config.yaml` wires the same checks into git.
- Adding a model field: edit `models.py` + `schemas.py`, then
  `cd backend && uv run alembic revision --autogenerate -m "..."`; the migration test will tell you
  if you forgot.
- Adding an endpoint: service function → router (pick `ViewerCtx`/`EditorCtx`/`OwnerCtx` and call
  `notify(...)` after mutations) → `frontend/src/api/types.ts` + `queries.ts` → MSW handler in
  `frontend/src/test/server.ts` so component tests can use it.
- CLI data commands (`list`, `export`, `import`, `import-legacy`) operate on one workspace: pass
  `--user EMAIL` (their personal planner) or `--workspace ID`; `planner users` lists everything.

## License

MIT

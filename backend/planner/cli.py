"""Command-line entry point: ``planner serve``, ``planner create-user``, import/export…"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Annotated

import typer
import uvicorn
from rich.console import Console
from rich.table import Table
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.config import get_settings
from planner.db import Database
from planner.models import User
from planner.schemas import ImportBundle, RegisterRequest, TaskFilter, TaskRead
from planner.services import auth as auth_svc
from planner.services import workspaces as ws_svc
from planner.services.errors import PlannerError

app = typer.Typer(help="Planner - personal & shared task planner.", no_args_is_help=True)
console = Console()


UserOpt = Annotated[
    str | None,
    typer.Option("--user", "-u", help="Email of the user whose personal planner to use."),
]
WorkspaceOpt = Annotated[
    int | None, typer.Option("--workspace", "-w", help="Workspace id to operate on.")
]


def _run[T](fn: Callable[[AsyncSession], Awaitable[T]]) -> T:
    """Open the database, run ``fn`` in a session, and report domain errors nicely."""
    settings = get_settings()

    async def go() -> T:
        db = Database(settings.resolved_database_url)
        await db.migrate()
        try:
            async with db.session_factory() as session:
                return await fn(session)
        finally:
            await db.dispose()

    try:
        return asyncio.run(go())
    except PlannerError as exc:
        console.print(f"[red]Error:[/] {exc.message}")
        raise typer.Exit(code=1) from exc


async def _resolve_workspace(session: AsyncSession, user: str | None, workspace: int | None) -> int:
    """Pick the workspace for data commands: explicit id, a user's personal one, or the
    only user's personal one when the instance has a single account."""
    if workspace is not None:
        return workspace
    if user is not None:
        row = await session.scalar(select(User).where(User.email == user.strip().lower()))
        if row is None:
            raise PlannerError(f"No user with email {user!r}")
        return (await ws_svc.personal_workspace(session, row.id)).id
    users = (await session.scalars(select(User))).all()
    if len(users) == 1:
        return (await ws_svc.personal_workspace(session, users[0].id)).id
    if not users:
        raise PlannerError("No accounts yet: run `planner create-user` first")
    raise PlannerError("Several accounts exist: pass --user EMAIL or --workspace ID")


@app.command()
def serve(
    host: Annotated[str | None, typer.Option(help="Bind address.")] = None,
    port: Annotated[int | None, typer.Option(help="Port.")] = None,
    reload: Annotated[bool, typer.Option(help="Auto-reload (development).")] = False,
) -> None:
    """Start the web application (API + built frontend)."""
    settings = get_settings()
    uvicorn.run(
        "planner.main:app",
        host=host or settings.host,
        port=port or settings.port,
        reload=reload,
        log_level="debug" if settings.debug else "info",
    )


@app.command()
def migrate() -> None:
    """Apply database migrations and exit."""

    async def noop(_: AsyncSession) -> None:
        return None

    _run(noop)
    console.print(f"[green]✓[/] Database up to date: {get_settings().resolved_database_url}")


@app.command("create-user")
def create_user(
    email: Annotated[str, typer.Argument(help="Email address (used to sign in).")],
    name: Annotated[str, typer.Option("--name", "-n", help="Display name.")],
    password: Annotated[
        str,
        typer.Option(prompt=True, confirmation_prompt=True, hide_input=True, help="Password."),
    ],
) -> None:
    """Create an account (handy when registration is disabled)."""

    async def go(session: AsyncSession) -> User:
        return await auth_svc.register(
            session, RegisterRequest(email=email, password=password, display_name=name)
        )

    user = _run(go)
    console.print(f"[green]✓[/] Created user {user.email} (id {user.id})")


@app.command()
def users() -> None:
    """List accounts and their planners."""

    async def go(session: AsyncSession) -> list[tuple[User, list[tuple[int, str, str]]]]:
        rows = (await session.scalars(select(User).order_by(User.id))).all()
        result = []
        for u in rows:
            spaces = await ws_svc.list_for_user(session, u.id)
            result.append((u, [(ws.id, ws.name, m.role.value) for ws, m, _, _ in spaces]))
        return result

    table = Table(title="Users")
    table.add_column("ID", justify="right", style="dim")
    table.add_column("Email")
    table.add_column("Name")
    table.add_column("Planners")
    for u, spaces in _run(go):
        table.add_row(
            str(u.id),
            u.email,
            u.display_name,
            ", ".join(f"#{i} {n} ({r})" for i, n, r in spaces),
        )
    console.print(table)


@app.command("import-legacy")
def import_legacy(
    file: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    user: UserOpt = None,
    workspace: WorkspaceOpt = None,
) -> None:
    """Import a ``planner_data.json`` file from the original CLI version."""
    from planner.services.transfer import import_legacy as svc_import

    payload = json.loads(file.read_text(encoding="utf-8"))

    async def go(session: AsyncSession) -> None:
        ws_id = await _resolve_workspace(session, user, workspace)
        result = await svc_import(session, ws_id, payload)
        console.print(
            f"[green]✓[/] Imported {result.tasks} tasks and {result.projects} projects "
            f"({result.skipped} skipped) into workspace #{ws_id}."
        )
        for w in result.warnings:
            console.print(f"  [yellow]![/] {w}")

    _run(go)


@app.command("import")
def import_bundle(
    file: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    replace: Annotated[bool, typer.Option(help="Wipe the workspace first.")] = False,
    user: UserOpt = None,
    workspace: WorkspaceOpt = None,
) -> None:
    """Import a JSON bundle exported from the web app."""
    from planner.services.transfer import import_bundle as svc_import

    bundle = ImportBundle.model_validate_json(file.read_text(encoding="utf-8"))

    async def go(session: AsyncSession) -> None:
        ws_id = await _resolve_workspace(session, user, workspace)
        result = await svc_import(session, ws_id, bundle, replace=replace)
        console.print(
            f"[green]✓[/] Imported {result.projects} projects, {result.tags} tags, "
            f"{result.tasks} tasks into workspace #{ws_id}."
        )

    _run(go)


@app.command()
def export(
    file: Annotated[Path, typer.Argument(dir_okay=False, writable=True)],
    user: UserOpt = None,
    workspace: WorkspaceOpt = None,
) -> None:
    """Export a workspace to a JSON bundle."""
    from planner.services.transfer import export_all

    async def go(session: AsyncSession) -> None:
        ws_id = await _resolve_workspace(session, user, workspace)
        bundle = await export_all(session, ws_id)
        file.write_text(bundle.model_dump_json(indent=2), encoding="utf-8")
        console.print(f"[green]✓[/] Exported {len(bundle.tasks)} tasks to {file}")

    _run(go)


@app.command("list")
def list_tasks(
    include_done: Annotated[bool, typer.Option("--all", help="Include completed tasks.")] = False,
    limit: Annotated[int, typer.Option(help="Maximum rows.")] = 50,
    user: UserOpt = None,
    workspace: WorkspaceOpt = None,
) -> None:
    """Print open tasks in the terminal (handy for scripts)."""
    from planner.services.tasks import list_tasks as svc_list

    async def go(session: AsyncSession) -> list[TaskRead]:
        ws_id = await _resolve_workspace(session, user, workspace)
        rows = await svc_list(session, ws_id, TaskFilter(include_done=include_done, limit=limit))
        return [TaskRead.model_validate(t) for t in rows]

    tasks = _run(go)
    table = Table(title="Tasks", show_lines=False)
    table.add_column("ID", justify="right", style="dim")
    table.add_column("Title")
    table.add_column("Project", style="blue")
    table.add_column("Assignee")
    table.add_column("Priority")
    table.add_column("Status")
    table.add_column("Due")
    for t in tasks:
        due = t.due_date.isoformat() if t.due_date else "—"
        if t.is_overdue:
            due = f"[red]{due}[/]"
        table.add_row(
            str(t.id),
            t.title,
            t.project.name if t.project else "Inbox",
            t.assignee.display_name if t.assignee else "—",
            t.priority.value,
            t.status.value,
            due,
        )
    console.print(table)


if __name__ == "__main__":  # pragma: no cover
    app()

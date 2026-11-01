"""Command-line entry point: ``planner serve``, ``planner import-legacy`` etc."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Annotated

import typer
import uvicorn
from rich.console import Console
from rich.table import Table

from planner.config import get_settings
from planner.db import Database
from planner.schemas import ImportBundle, TaskFilter, TaskRead

app = typer.Typer(help="Planner - personal task planner.", no_args_is_help=True)
console = Console()


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
    settings = get_settings()

    async def _run() -> None:
        db = Database(settings.resolved_database_url)
        await db.migrate()
        await db.dispose()

    asyncio.run(_run())
    console.print(f"[green]✓[/] Database up to date: {settings.resolved_database_url}")


@app.command("import-legacy")
def import_legacy(
    file: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
) -> None:
    """Import a ``planner_data.json`` file from the original CLI version."""
    from planner.services.transfer import import_legacy as svc_import

    payload = json.loads(file.read_text(encoding="utf-8"))
    settings = get_settings()

    async def _run() -> None:
        db = Database(settings.resolved_database_url)
        await db.migrate()
        async with db.session_factory() as session:
            result = await svc_import(session, payload)
        await db.dispose()
        console.print(
            f"[green]✓[/] Imported {result.tasks} tasks and {result.projects} projects "
            f"({result.skipped} skipped)."
        )
        for w in result.warnings:
            console.print(f"  [yellow]![/] {w}")

    asyncio.run(_run())


@app.command("import")
def import_bundle(
    file: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    replace: Annotated[bool, typer.Option(help="Wipe existing data first.")] = False,
) -> None:
    """Import a JSON bundle exported from the web app."""
    from planner.services.transfer import import_bundle as svc_import

    bundle = ImportBundle.model_validate_json(file.read_text(encoding="utf-8"))
    settings = get_settings()

    async def _run() -> None:
        db = Database(settings.resolved_database_url)
        await db.migrate()
        async with db.session_factory() as session:
            result = await svc_import(session, bundle, replace=replace)
        await db.dispose()
        console.print(
            f"[green]✓[/] Imported {result.projects} projects, {result.tags} tags, "
            f"{result.tasks} tasks."
        )

    asyncio.run(_run())


@app.command()
def export(
    file: Annotated[Path, typer.Argument(dir_okay=False, writable=True)],
) -> None:
    """Export everything to a JSON bundle."""
    from planner.services.transfer import export_all

    settings = get_settings()

    async def _run() -> None:
        db = Database(settings.resolved_database_url)
        await db.migrate()
        async with db.session_factory() as session:
            bundle = await export_all(session)
        await db.dispose()
        file.write_text(bundle.model_dump_json(indent=2), encoding="utf-8")
        console.print(f"[green]✓[/] Exported {len(bundle.tasks)} tasks to {file}")

    asyncio.run(_run())


@app.command("list")
def list_tasks(
    include_done: Annotated[bool, typer.Option("--all", help="Include completed tasks.")] = False,
    limit: Annotated[int, typer.Option(help="Maximum rows.")] = 50,
) -> None:
    """Print open tasks in the terminal (handy for scripts)."""
    from planner.services.tasks import list_tasks as svc_list

    settings = get_settings()

    async def _run() -> list[TaskRead]:
        db = Database(settings.resolved_database_url)
        await db.migrate()
        async with db.session_factory() as session:
            rows = await svc_list(session, TaskFilter(include_done=include_done, limit=limit))
            result = [TaskRead.model_validate(t) for t in rows]
        await db.dispose()
        return result

    tasks = asyncio.run(_run())
    table = Table(title="Tasks", show_lines=False)
    table.add_column("ID", justify="right", style="dim")
    table.add_column("Title")
    table.add_column("Project", style="blue")
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
            t.priority.value,
            t.status.value,
            due,
        )
    console.print(table)


if __name__ == "__main__":  # pragma: no cover
    app()

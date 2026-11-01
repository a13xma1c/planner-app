"""Alembic migrations must match the ORM models and round-trip cleanly."""

from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from planner.db import Database
from planner.models import Base


async def test_upgrade_creates_expected_tables(tmp_path: Path):
    db = Database(f"sqlite+aiosqlite:///{tmp_path / 'm.db'}")
    await db.migrate()
    await db.migrate()  # idempotent
    async with db.engine.connect() as conn:
        tables = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
    await db.dispose()
    assert {"projects", "tags", "tasks", "subtasks", "task_tags", "alembic_version"} <= tables


async def test_migrations_are_in_sync_with_models(tmp_path: Path):
    """Fails when a model changes without a corresponding migration."""
    db = Database(f"sqlite+aiosqlite:///{tmp_path / 'sync.db'}")
    await db.migrate()

    def diff(conn):
        ctx = MigrationContext.configure(conn, opts={"compare_type": True, "render_as_batch": True})
        return compare_metadata(ctx, Base.metadata)

    async with db.engine.connect() as conn:
        differences = await conn.run_sync(diff)
    await db.dispose()
    assert differences == [], differences

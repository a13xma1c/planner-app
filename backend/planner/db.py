"""Async SQLAlchemy engine/session management and Alembic migration runner."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import event
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from planner.config import PACKAGE_DIR

ALEMBIC_DIR = PACKAGE_DIR / "alembic"


def _enable_sqlite_fks(dbapi_connection: object, _record: object) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_engine(database_url: str, *, echo: bool = False) -> AsyncEngine:
    """Create an async engine. SQLite gets FK enforcement turned on per-connection."""
    if database_url.startswith("sqlite"):
        path = database_url.split("///", 1)[-1]
        if path and path != ":memory:" and not path.startswith("file:"):
            Path(path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_async_engine(database_url, echo=echo)
    if database_url.startswith("sqlite"):
        event.listen(engine.sync_engine, "connect", _enable_sqlite_fks)
    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


def _run_alembic_upgrade(connection: Connection) -> None:
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    cfg.attributes["connection"] = connection
    command.upgrade(cfg, "head")


async def run_migrations(engine: AsyncEngine) -> None:
    """Bring the database schema up to date (idempotent)."""
    async with engine.begin() as conn:
        await conn.run_sync(_run_alembic_upgrade)


class Database:
    """Small container bundling an engine and its session factory."""

    def __init__(self, database_url: str, *, echo: bool = False) -> None:
        self.url = database_url
        self.engine = create_engine(database_url, echo=echo)
        self.session_factory = create_session_factory(self.engine)

    async def migrate(self) -> None:
        await run_migrations(self.engine)

    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.session_factory() as session:
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()

"""Alembic environment.

Supports two modes:
* programmatic: ``planner.db.run_migrations`` passes a live connection via
  ``config.attributes["connection"]`` (used at app start-up and in tests);
* CLI: ``alembic -c backend/alembic.ini upgrade head`` using ``PLANNER_DATABASE_URL``.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from planner.config import get_settings
from planner.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _run(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # required for ALTER TABLE on SQLite
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url") or get_settings().resolved_database_url
    context.configure(
        url=url, target_metadata=target_metadata, literal_binds=True, render_as_batch=True
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = (
        section.get("sqlalchemy.url") or get_settings().resolved_database_url
    )
    engine = async_engine_from_config(section, prefix="sqlalchemy.")
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
    else:
        asyncio.run(_run_async())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

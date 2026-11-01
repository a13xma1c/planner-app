"""Shared fixtures: an isolated in-memory database + HTTP client per test."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from planner.config import Settings
from planner.db import Database
from planner.main import create_app

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        data_dir=tmp_path,
        database_url="sqlite+aiosqlite://",  # private in-memory DB per test
        frontend_dist=tmp_path / "no-frontend",
    )


@pytest.fixture
async def db(settings: Settings) -> AsyncIterator[Database]:
    database = Database(settings.resolved_database_url)
    await database.migrate()
    yield database
    await database.dispose()


@pytest.fixture
async def session(db: Database) -> AsyncIterator[AsyncSession]:
    async with db.session_factory() as s:
        yield s


@pytest.fixture
async def client(settings: Settings, db: Database) -> AsyncIterator[AsyncClient]:
    app = create_app(settings, database=db)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


class Api:
    """Tiny helper for building fixtures through the public API."""

    def __init__(self, client: AsyncClient) -> None:
        self.client = client

    async def task(self, title: str = "Task", **fields: Any) -> dict[str, Any]:
        r = await self.client.post("/api/tasks", json={"title": title, **fields})
        assert r.status_code == 201, r.text
        return r.json()

    async def project(self, name: str = "Project", **fields: Any) -> dict[str, Any]:
        r = await self.client.post("/api/projects", json={"name": name, **fields})
        assert r.status_code == 201, r.text
        return r.json()

    async def tag(self, name: str = "tag", **fields: Any) -> dict[str, Any]:
        r = await self.client.post("/api/tags", json={"name": name, **fields})
        assert r.status_code == 201, r.text
        return r.json()


@pytest.fixture
def api(client: AsyncClient) -> Api:
    return Api(client)

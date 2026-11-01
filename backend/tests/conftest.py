"""Shared fixtures: an isolated in-memory database + authenticated HTTP clients per test."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.deps import SESSION_COOKIE, WORKSPACE_HEADER
from planner.config import Settings
from planner.db import Database
from planner.main import create_app
from planner.models import User
from planner.schemas import RegisterRequest
from planner.services import auth as auth_svc

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)

PASSWORD = "correct horse battery"


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
async def app(settings: Settings, db: Database):
    application = create_app(settings, database=db)
    async with application.router.lifespan_context(application):
        yield application


async def make_user(db: Database, email: str, name: str) -> User:
    """Register a user directly through the service layer."""
    async with db.session_factory() as s:
        return await auth_svc.register(
            s, RegisterRequest(email=email, password=PASSWORD, display_name=name)
        )


def client_for(app, token: str | None = None, workspace_id: int | None = None) -> AsyncClient:
    headers = {WORKSPACE_HEADER: str(workspace_id)} if workspace_id else {}
    cookies = {SESSION_COOKIE: token} if token else {}
    return AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers=headers, cookies=cookies
    )


@pytest.fixture
async def user(db: Database) -> User:
    return await make_user(db, "alice@example.com", "Alice")


@pytest.fixture
async def token(db: Database, user: User) -> str:
    async with db.session_factory() as s:
        return await auth_svc.create_session(s, user, user_agent="pytest")


@pytest.fixture
async def client(app, token: str) -> AsyncIterator[AsyncClient]:
    """Signed in as Alice, operating on her personal workspace (no header needed)."""
    async with client_for(app, token) as c:
        yield c


@pytest.fixture
async def anon(app) -> AsyncIterator[AsyncClient]:
    """An unauthenticated client."""
    async with client_for(app) as c:
        yield c


@pytest.fixture
async def bob(db: Database) -> User:
    return await make_user(db, "bob@example.com", "Bob")


@pytest.fixture
async def bob_client(app, db: Database, bob: User) -> AsyncIterator[AsyncClient]:
    async with db.session_factory() as s:
        token = await auth_svc.create_session(s, bob, user_agent="pytest")
    async with client_for(app, token) as c:
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

    async def workspace(self, name: str = "Shared") -> dict[str, Any]:
        r = await self.client.post("/api/workspaces", json={"name": name})
        assert r.status_code == 201, r.text
        return r.json()

    async def invite(
        self, workspace_id: int, role: str = "editor", **fields: Any
    ) -> dict[str, Any]:
        r = await self.client.post(
            "/api/workspaces/current/invitations",
            json={"role": role, **fields},
            headers={WORKSPACE_HEADER: str(workspace_id)},
        )
        assert r.status_code == 201, r.text
        return r.json()


@pytest.fixture
def api(client: AsyncClient) -> Api:
    return Api(client)

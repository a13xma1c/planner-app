"""Rate limiting, security headers, cross-site write guard, housekeeping, health."""

from datetime import timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from planner.config import Settings
from planner.db import Database
from planner.main import create_app
from planner.models import Invitation, Session, Workspace, utcnow
from planner.services import maintenance
from tests.conftest import PASSWORD, Api, client_for

LOGIN = {"email": "alice@example.com", "password": "wrong-password-1"}


@pytest.fixture
def strict_settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url="sqlite+aiosqlite://",
        frontend_dist=tmp_path / "none",
        login_attempts_per_minute=3,
        login_attempts_per_email_per_15min=5,
        register_attempts_per_hour=2,
    )


@pytest.fixture
async def strict_client(strict_settings: Settings, db: Database, user):
    app = create_app(strict_settings, database=db)
    async with app.router.lifespan_context(app), client_for(app) as c:
        yield c


class TestRateLimiting:
    async def test_login_is_throttled_per_ip(self, strict_client: AsyncClient):
        for _ in range(3):
            assert (await strict_client.post("/api/auth/login", json=LOGIN)).status_code == 401
        r = await strict_client.post("/api/auth/login", json=LOGIN)
        assert r.status_code == 429
        assert "Too many sign-in attempts" in r.json()["detail"]
        assert int(r.headers["retry-after"]) >= 1
        assert r.json()["retry_after"] == int(r.headers["retry-after"])
        # even the right password is refused while throttled
        ok = {"email": "alice@example.com", "password": PASSWORD}
        assert (await strict_client.post("/api/auth/login", json=ok)).status_code == 429

    async def test_successful_login_resets_the_account_counter(self, strict_client: AsyncClient):
        limiter = strict_client._transport.app.state.rate_limiter  # type: ignore[attr-defined]
        assert (await strict_client.post("/api/auth/login", json=LOGIN)).status_code == 401
        ok = {"email": "alice@example.com", "password": PASSWORD}
        assert (await strict_client.post("/api/auth/login", json=ok)).status_code == 200
        assert "login:email:alice@example.com" not in limiter._hits

    async def test_register_is_throttled(self, strict_client: AsyncClient):
        reg = {"password": "orbit-cactus-lantern-7", "display_name": "X"}
        assert (
            await strict_client.post("/api/auth/register", json={**reg, "email": "a1@example.com"})
        ).status_code == 201
        assert (
            await strict_client.post("/api/auth/register", json={**reg, "email": "a2@example.com"})
        ).status_code == 201
        r = await strict_client.post("/api/auth/register", json={**reg, "email": "a3@example.com"})
        assert r.status_code == 429
        assert "sign-up" in r.json()["detail"]

    async def test_password_check_is_throttled_generously(self, strict_client: AsyncClient):
        for _ in range(120):
            assert (
                await strict_client.post("/api/auth/password/check", json={"password": "x"})
            ).status_code == 200
        assert (
            await strict_client.post("/api/auth/password/check", json={"password": "x"})
        ).status_code == 429

    async def test_can_be_disabled(self, tmp_path: Path, db: Database, user):
        settings = Settings(
            database_url="sqlite+aiosqlite://",
            frontend_dist=tmp_path,
            rate_limit_enabled=False,
            login_attempts_per_minute=1,
        )
        app = create_app(settings, database=db)
        async with app.router.lifespan_context(app), client_for(app) as c:
            for _ in range(5):
                assert (await c.post("/api/auth/login", json=LOGIN)).status_code == 401

    async def test_proxy_header_is_ignored_unless_trusted(
        self, strict_client: AsyncClient, tmp_path, db, user
    ):
        # untrusted: all requests share the test client's IP -> throttled together
        for i in range(3):
            await strict_client.post(
                "/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": f"10.0.0.{i}"}
            )
        assert (
            await strict_client.post(
                "/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "10.0.0.9"}
            )
        ).status_code == 429

        settings = Settings(
            database_url="sqlite+aiosqlite://",
            frontend_dist=tmp_path / "none",
            login_attempts_per_minute=1,
            trust_proxy_headers=True,
        )
        app = create_app(settings, database=db)
        async with app.router.lifespan_context(app), client_for(app) as c:
            assert (
                await c.post(
                    "/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "10.0.0.1, 10.0.0.2"}
                )
            ).status_code == 401
            assert (
                await c.post("/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "10.0.0.1"})
            ).status_code == 429
            assert (
                await c.post("/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "10.0.0.7"})
            ).status_code == 401


class TestSecurityMiddleware:
    async def test_security_headers_on_every_response(self, client: AsyncClient):
        r = await client.get("/api/health")
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        assert r.headers["x-frame-options"] == "DENY"
        assert "camera=()" in r.headers["permissions-policy"]
        assert "content-security-policy" not in r.headers  # API responses carry no CSP
        assert "strict-transport-security" not in r.headers  # only with secure cookies

    async def test_csp_with_inline_script_hash_and_hsts_when_secure(
        self, tmp_path: Path, db: Database
    ):
        dist = tmp_path / "dist"
        dist.mkdir()
        (dist / "index.html").write_text(
            "<html><head><script>console.log('theme')</script>"
            '<script src="/assets/a.js"></script></head></html>'
        )
        settings = Settings(
            database_url="sqlite+aiosqlite://", frontend_dist=dist, secure_cookies=True
        )
        app = create_app(settings, database=db)
        async with app.router.lifespan_context(app), client_for(app) as c:
            r = await c.get("/")
            csp = r.headers["content-security-policy"]
            assert "default-src 'self'" in csp
            assert "frame-ancestors 'none'" in csp
            assert "script-src 'self' 'sha256-" in csp  # the inline theme bootstrap is allow-listed
            assert csp.count("sha256-") == 1  # external scripts don't get hashes
            assert r.headers["strict-transport-security"].startswith("max-age=")

    @pytest.mark.parametrize(
        ("headers", "blocked"),
        [
            ({}, False),  # no Origin (same-origin navigations, curl, tests)
            ({"Origin": "http://test"}, False),  # matches Host
            ({"Origin": "HTTP://TEST"}, False),
            ({"Origin": "http://localhost:5173"}, False),  # dev server is allow-listed
            ({"Origin": "https://evil.example"}, True),
            ({"Origin": "null"}, True),
            ({"Sec-Fetch-Site": "cross-site"}, True),
            ({"Sec-Fetch-Site": "same-origin"}, False),
        ],
    )
    async def test_cross_site_write_guard(self, client: AsyncClient, headers: dict, blocked: bool):
        r = await client.post("/api/tasks", json={"title": "x"}, headers=headers)
        if blocked:
            assert r.status_code == 403
            assert r.json() == {"detail": "Cross-site requests are not allowed"}
        else:
            assert r.status_code == 201
        # reads are never blocked
        assert (await client.get("/api/tasks", headers=headers)).status_code == 200

    async def test_unknown_api_paths_are_json_404_even_with_spa(self, tmp_path: Path, db: Database):
        dist = tmp_path / "dist"
        dist.mkdir()
        (dist / "index.html").write_text("<html>app</html>")
        settings = Settings(database_url="sqlite+aiosqlite://", frontend_dist=dist)
        app = create_app(settings, database=db)
        async with app.router.lifespan_context(app), client_for(app) as c:
            r = await c.get("/api/does-not-exist")
            assert r.status_code == 404
            assert r.json() == {"detail": "Not found"}
            assert (await c.get("/board")).text == "<html>app</html>"


class TestHousekeeping:
    async def test_purge_expired(self, db: Database, api: Api, user):
        async with db.session_factory() as s:
            now = utcnow()
            s.add(
                Session(token_hash="a" * 64, user_id=user.id, expires_at=now - timedelta(seconds=1))
            )
            s.add(Session(token_hash="b" * 64, user_id=user.id, expires_at=now + timedelta(days=1)))
            ws = Workspace(name="w")
            s.add(ws)
            await s.flush()
            s.add(Invitation(workspace_id=ws.id, token="old", expires_at=now - timedelta(days=40)))
            s.add(
                Invitation(workspace_id=ws.id, token="recent", expires_at=now - timedelta(days=1))
            )
            s.add(
                Invitation(
                    workspace_id=ws.id,
                    token="revoked-long-ago",
                    expires_at=now + timedelta(days=1),
                    revoked_at=now - timedelta(days=31),
                )
            )
            await s.commit()
            removed = await maintenance.purge_expired(s)
            assert removed == {"sessions": 1, "invitations": 2}
            assert (await s.scalar(select(func.count(Session.id)))) >= 1
            assert {i.token for i in (await s.scalars(select(Invitation))).all()} == {"recent"}

    async def test_runs_at_startup(self, db: Database, settings: Settings, user):
        async with db.session_factory() as s:
            s.add(
                Session(
                    token_hash="c" * 64, user_id=user.id, expires_at=utcnow() - timedelta(days=1)
                )
            )
            await s.commit()
        app = create_app(settings, database=db)
        async with app.router.lifespan_context(app):
            pass
        async with db.session_factory() as s:
            assert (
                await s.scalar(select(func.count(Session.id)).where(Session.token_hash == "c" * 64))
                == 0
            )


class TestHealth:
    async def test_reports_database_failure(self, settings: Settings, db: Database, monkeypatch):
        app = create_app(settings, database=db)

        async def broken() -> bool:
            return False

        monkeypatch.setattr(db, "ping", broken)
        async with app.router.lifespan_context(app), client_for(app) as c:
            r = await c.get("/api/health")
            assert r.status_code == 503
            assert r.json()["detail"] == "database unavailable"

    async def test_wal_mode_for_file_databases(self, tmp_path: Path):
        from sqlalchemy import text

        database = Database(f"sqlite+aiosqlite:///{tmp_path / 'wal.db'}")
        async with database.engine.connect() as conn:
            mode = (await conn.execute(text("PRAGMA journal_mode"))).scalar_one()
            timeout = (await conn.execute(text("PRAGMA busy_timeout"))).scalar_one()
        await database.dispose()
        assert mode == "wal"
        assert timeout == 5000
        assert await Database(f"sqlite+aiosqlite:///{tmp_path / 'wal.db'}").ping() is True

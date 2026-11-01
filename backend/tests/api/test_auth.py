"""Registration, login, sessions, profile."""

import pytest
from httpx import AsyncClient

from planner.api.deps import SESSION_COOKIE
from planner.config import Settings
from planner.db import Database
from planner.main import create_app
from tests.conftest import PASSWORD, client_for

REG = {
    "email": "New@Example.com",
    "password": "orbit-cactus-lantern-7",
    "display_name": "  Newbie ",
}


async def test_register_sets_cookie_and_creates_personal_workspace(anon: AsyncClient):
    r = await anon.post("/api/auth/register", json=REG)
    assert r.status_code == 201, r.text
    assert r.json() == {"id": 1, "email": "new@example.com", "display_name": "Newbie"}
    cookie = r.cookies.get(SESSION_COOKIE)
    assert cookie
    assert "HttpOnly" in r.headers["set-cookie"]
    assert "SameSite=lax" in r.headers["set-cookie"].lower().replace("samesite=lax", "SameSite=lax")

    me = await anon.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "new@example.com"
    spaces = (await anon.get("/api/workspaces")).json()
    assert len(spaces) == 1
    assert spaces[0]["is_personal"] is True
    assert spaces[0]["role"] == "owner"
    assert spaces[0]["name"] == "Newbie's planner"


async def test_register_validation(anon: AsyncClient):
    for payload in [
        {**REG, "email": "not-an-email"},
        {**REG, "password": ""},
        {**REG, "display_name": "   "},
        {},
    ]:
        assert (await anon.post("/api/auth/register", json=payload)).status_code == 422


@pytest.mark.parametrize(
    ("password", "problem"),
    [
        ("short", "shorter than 10"),
        ("password123", "too common"),
        ("P@ssw0rd2024!", "too common"),
        ("Newbie-rocks-2030", "contains your name or email"),
        ("new@example.com!", "contains your name or email"),
        ("abcdefghijkl", "predictable sequence"),
        ("aaaaaaaaaaaa", "repeats the same characters"),
    ],
)
async def test_register_rejects_weak_passwords(anon: AsyncClient, password: str, problem: str):
    r = await anon.post("/api/auth/register", json={**REG, "password": password})
    assert r.status_code == 422, r.text
    assert r.json()["detail"].startswith("Password ")
    assert problem in r.json()["detail"]
    assert (await anon.get("/api/auth/me")).status_code == 401  # no account was created


async def test_password_check_endpoint_is_public_and_context_aware(anon: AsyncClient):
    r = await anon.post("/api/auth/password/check", json={"password": "Alice-Wonder-2030"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["label"] in ("Good", "Strong")
    assert body["problem"] is None
    assert {c["id"] for c in body["checks"]} >= {"length", "common", "personal", "sequence"}

    r = await anon.post(
        "/api/auth/password/check",
        json={"password": "Alice-Wonder-2030", "display_name": "Alice Wonder", "email": "a@b.co"},
    )
    body = r.json()
    assert body["ok"] is False
    assert body["score"] == 1
    assert body["problem"] == "Password contains your name or email."
    personal = next(c for c in body["checks"] if c["id"] == "personal")
    assert personal == {
        "id": "personal",
        "label": "Doesn't contain your name or email",
        "problem": "contains your name or email",
        "passed": False,
        "required": True,
    }

    r = await anon.post("/api/auth/password/check", json={"password": "password"})
    assert r.json()["score"] == 0
    assert "suggestions" in r.json()


async def test_register_duplicate_email_is_case_insensitive(anon: AsyncClient, user):
    r = await anon.post("/api/auth/register", json={**REG, "email": "ALICE@example.com"})
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


async def test_login_logout(anon: AsyncClient, user):
    r = await anon.post(
        "/api/auth/login", json={"email": "Alice@Example.com", "password": PASSWORD}
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Alice"
    assert (await anon.get("/api/auth/me")).status_code == 200

    r = await anon.post("/api/auth/logout")
    assert r.status_code == 204
    assert (await anon.get("/api/auth/me")).status_code == 401


async def test_login_failures_do_not_reveal_accounts(anon: AsyncClient, user):
    wrong_pw = await anon.post(
        "/api/auth/login", json={"email": "alice@example.com", "password": "nope-nope"}
    )
    no_user = await anon.post(
        "/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"}
    )
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json()


async def test_invalid_or_expired_cookie(app):
    async with client_for(app, token="bogus-token") as c:
        r = await c.get("/api/auth/me")
        assert r.status_code == 401
        assert "expired" in r.json()["detail"]


async def test_profile_and_password_change(client: AsyncClient, anon: AsyncClient):
    r = await client.patch("/api/auth/me", json={"display_name": " Alice B. "})
    assert r.status_code == 200
    assert r.json()["display_name"] == "Alice B."

    r = await client.post(
        "/api/auth/password",
        json={"current_password": "wrong-pw", "new_password": "velvet-otter-glacier-3"},
    )
    assert r.status_code == 403
    r = await client.post(
        "/api/auth/password", json={"current_password": PASSWORD, "new_password": PASSWORD}
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "velvet-otter-glacier-3"},
    )
    assert r.status_code == 204
    assert (
        await anon.post(
            "/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD}
        )
    ).status_code == 401
    assert (
        await anon.post(
            "/api/auth/login",
            json={"email": "alice@example.com", "password": "velvet-otter-glacier-3"},
        )
    ).status_code == 200


async def test_sessions_listing_and_revoking_others(client: AsyncClient, anon: AsyncClient):
    await anon.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    r = await client.get("/api/auth/sessions")
    assert r.status_code == 200
    sessions = r.json()
    assert len(sessions) == 2
    assert sum(s["is_current"] for s in sessions) == 1
    r = await client.post("/api/auth/sessions/revoke-others")
    assert r.json() == {"revoked": 1}
    assert (await anon.get("/api/auth/me")).status_code == 401
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_registration_can_be_disabled_after_first_user(tmp_path, db: Database):
    settings = Settings(
        database_url="sqlite+aiosqlite://", frontend_dist=tmp_path, allow_registration=False
    )
    app = create_app(settings, database=db)
    async with app.router.lifespan_context(app), client_for(app) as c:
        first = await c.post("/api/auth/register", json=REG)
        assert first.status_code == 201  # the very first account is always allowed
        second = await c.post("/api/auth/register", json={**REG, "email": "two@example.com"})
        assert second.status_code == 403
        assert "invite" in second.json()["detail"]


async def test_first_user_adopts_legacy_data(db: Database, app):
    """Data migrated from the single-user era is owned by whoever registers first."""
    from sqlalchemy import text

    async with db.session_factory() as s:
        await s.execute(
            text(
                "INSERT INTO workspaces (name, is_personal, created_at, updated_at) "
                "VALUES ('My planner', 1, '2025-01-01', '2025-01-01')"
            )
        )
        await s.execute(
            text(
                "INSERT INTO tasks (workspace_id, title, notes, priority, status, position, "
                "created_at, updated_at) VALUES (1, 'old task', '', 'medium', 'todo', 0, "
                "'2025-01-01', '2025-01-01')"
            )
        )
        await s.commit()

    async with client_for(app) as first, client_for(app) as second:
        await first.post("/api/auth/register", json=REG)
        spaces = (await first.get("/api/workspaces")).json()
        assert [w["name"] for w in spaces] == ["My planner"]
        assert [t["title"] for t in (await first.get("/api/tasks")).json()] == ["old task"]

        await second.post("/api/auth/register", json={**REG, "email": "two@example.com"})
        spaces = (await second.get("/api/workspaces")).json()
        assert [w["name"] for w in spaces] == ["Newbie's planner"]
        assert (await second.get("/api/tasks")).json() == []


async def test_session_expiry_slides_forward_on_use(db: Database, app, user):
    """Sessions are refreshed at most once an hour and expire after 30 days of inactivity."""
    from datetime import timedelta

    from sqlalchemy import select

    from planner.models import Session as SessionRow
    from planner.models import utcnow
    from planner.services import auth as auth_svc

    async with db.session_factory() as s:
        token = await auth_svc.create_session(s, user)
        row = await s.scalar(select(SessionRow))
        row.last_seen_at = utcnow() - timedelta(hours=2)
        old_expiry = row.expires_at
        await s.commit()

    async with client_for(app, token=token) as c:
        assert (await c.get("/api/auth/me")).status_code == 200

    async with db.session_factory() as s:
        row = await s.scalar(select(SessionRow))
        assert row.expires_at > old_expiry
        row.expires_at = utcnow() - timedelta(seconds=1)
        await s.commit()

    async with client_for(app, token=token) as c:
        assert (await c.get("/api/auth/me")).status_code == 401

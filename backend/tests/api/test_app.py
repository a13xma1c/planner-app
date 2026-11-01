"""Application-level behaviour: health, docs, error mapping, SPA hosting."""

from pathlib import Path

from httpx import ASGITransport, AsyncClient

from planner.config import Settings
from planner.db import Database
from planner.main import create_app


async def test_health(client: AsyncClient):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["version"]


async def test_openapi_available(client: AsyncClient):
    r = await client.get("/api/openapi.json")
    assert r.status_code == 200
    assert "/api/tasks" in r.json()["paths"]


async def test_404_for_unknown_api_route_without_frontend(client: AsyncClient):
    assert (await client.get("/nothing-here")).status_code == 404


async def test_spa_is_served_when_built(tmp_path: Path, db: Database):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>planner</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    settings = Settings(database_url="sqlite+aiosqlite://", frontend_dist=dist)
    app = create_app(settings, database=db)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c,
    ):
        assert (await c.get("/")).text == "<html>planner</html>"
        # client-side routes fall back to index.html
        assert (await c.get("/board")).text == "<html>planner</html>"
        assert (await c.get("/assets/app.js")).text == "console.log(1)"
        assert (await c.get("/favicon.svg")).text == "<svg/>"
        # path traversal is blocked
        assert (await c.get("/../pyproject.toml")).text == "<html>planner</html>"
        # API still wins
        assert (await c.get("/api/health")).status_code == 200


async def test_app_creates_its_own_database(tmp_path: Path):
    settings = Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'nested' / 'p.db'}",
        frontend_dist=tmp_path / "none",
    )
    app = create_app(settings)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c,
    ):
        r = await c.post("/api/tasks", json={"title": "persist"})
        assert r.status_code == 201
    assert (tmp_path / "nested" / "p.db").exists()


def test_settings_default_url(tmp_path: Path):
    s = Settings(data_dir=tmp_path, database_url=None)
    assert s.resolved_database_url == f"sqlite+aiosqlite:///{tmp_path / 'planner.db'}"

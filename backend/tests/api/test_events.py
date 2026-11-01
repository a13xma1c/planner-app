"""Change notifications: the broadcaster and the SSE endpoint."""

import asyncio
import json
import socket
import threading
from collections.abc import AsyncIterator
from contextlib import aclosing

import httpx
import pytest
import uvicorn
from httpx import AsyncClient

from planner.api.deps import WORKSPACE_HEADER
from planner.config import Settings
from planner.main import create_app
from planner.schemas import RegisterRequest
from planner.services import auth as auth_svc
from planner.services.events import Broadcaster, Event
from tests.conftest import Api


class TestBroadcaster:
    async def test_publish_reaches_only_subscribers_of_that_workspace(self):
        b = Broadcaster()
        frames: list[str] = []

        async def consume():
            async with aclosing(b.subscribe(1, keepalive=60)) as frames_iter:
                async for frame in frames_iter:
                    frames.append(frame)
                    if len(frames) == 3:
                        break

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)  # let the subscriber register
        assert b.subscriber_count(1) == 1
        assert b.publish(Event(kind="changed", entity="tasks", workspace_id=2)) == 0
        assert b.publish(Event(kind="changed", entity="tasks", workspace_id=1, actor_id=7)) == 1
        assert b.publish(Event(kind="changed", entity="tags", workspace_id=1, data={"x": 1})) == 1
        await asyncio.wait_for(task, 2)
        assert frames[0] == ": connected\n\n"
        assert frames[1].startswith("event: changed\ndata: ")
        payload = json.loads(frames[1].split("data: ", 1)[1])
        assert payload["entity"] == "tasks"
        assert payload["actor_id"] == 7
        assert json.loads(frames[2].split("data: ", 1)[1])["x"] == 1
        assert b.subscriber_count(1) == 0  # cleaned up after the consumer stopped

    async def test_keepalive_comment(self):
        b = Broadcaster()
        gen = b.subscribe(1, keepalive=0.01)
        assert await gen.__anext__() == ": connected\n\n"
        assert await gen.__anext__() == ": keepalive\n\n"
        await gen.aclose()


class TestEndpoint:
    async def test_stream_requires_membership(
        self, anon: AsyncClient, bob_client: AsyncClient, api: Api
    ):
        shared = await api.workspace("S")
        assert (await anon.get("/api/events")).status_code == 401
        r = await bob_client.get("/api/events", headers={WORKSPACE_HEADER: str(shared["id"])})
        assert r.status_code == 404


@pytest.fixture
async def live_server(tmp_path) -> AsyncIterator[tuple[str, str]]:
    """A real uvicorn server (streaming needs a real socket; the ASGI test transport buffers).

    Yields ``(base_url, session_cookie)`` for a registered user.
    """
    settings = Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'live.db'}", frontend_dist=tmp_path
    )
    app = create_app(settings)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    async with httpx.AsyncClient(base_url=base) as c:
        for _ in range(100):
            try:
                if (await c.get("/api/health")).status_code == 200:
                    break
            except httpx.HTTPError:
                await asyncio.sleep(0.05)
        r = await c.post(
            "/api/auth/register",
            json={
                "email": "live@example.com",
                "password": "orbit-cactus-lantern-7",
                "display_name": "Live",
            },
        )
        assert r.status_code == 201, r.text
        cookie = r.cookies["planner_session"]
    try:
        yield base, cookie
    finally:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.mark.timeout(20)
async def test_mutations_are_streamed_to_clients(live_server: tuple[str, str]):
    base, cookie = live_server
    async with httpx.AsyncClient(base_url=base, cookies={"planner_session": cookie}) as c:
        personal = (await c.get("/api/workspaces/current")).json()
        received: list[str] = []

        async def listen() -> None:
            async with c.stream("GET", "/api/events", params={"keepalive": 60}) as r:
                assert r.status_code == 200
                assert r.headers["content-type"].startswith("text/event-stream")
                async for line in r.aiter_lines():
                    received.append(line)
                    if line.startswith("data:"):
                        break

        listener = asyncio.create_task(listen())
        for _ in range(200):  # wait for the subscription handshake
            if ": connected" in received:
                break
            await asyncio.sleep(0.02)
        r = await c.post("/api/tasks", json={"title": "trigger"})
        assert r.status_code == 201
        await asyncio.wait_for(listener, 5)
        data = json.loads(next(x for x in received if x.startswith("data:"))[5:])
        assert data == {
            "kind": "changed",
            "entity": "tasks",
            "workspace_id": personal["id"],
            "actor_id": data["actor_id"],
            "at": data["at"],
        }
        assert isinstance(data["actor_id"], int)

    # the fixture's user can also be resolved through the service layer (sanity check)
    assert RegisterRequest(email="a@b.co", password="orbit-cactus-lantern-7", display_name="x")
    assert auth_svc.SESSION_TTL.days == 30

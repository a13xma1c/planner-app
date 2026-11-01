from httpx import AsyncClient

from planner.api.deps import WORKSPACE_HEADER
from tests.conftest import Api


async def test_comment_lifecycle(client: AsyncClient, api: Api, bob_client: AsyncClient, bob):
    shared = await api.workspace("Team")
    inv = await api.invite(shared["id"])
    await bob_client.post(f"/api/invitations/{inv['token']}/accept")
    h = {WORKSPACE_HEADER: str(shared["id"])}
    task = (await client.post("/api/tasks", json={"title": "discuss"}, headers=h)).json()

    r = await bob_client.post(
        f"/api/tasks/{task['id']}/comments", json={"body": "  First!  "}, headers=h
    )
    assert r.status_code == 201, r.text
    comment = r.json()
    assert comment["body"] == "First!"
    assert comment["author"] == {"id": bob.id, "display_name": "Bob"}

    r = await client.post(f"/api/tasks/{task['id']}/comments", json={"body": "Reply"}, headers=h)
    assert r.status_code == 201
    listing = (await client.get(f"/api/tasks/{task['id']}/comments", headers=h)).json()
    assert [c["body"] for c in listing] == ["First!", "Reply"]
    assert (await client.get(f"/api/tasks/{task['id']}", headers=h)).json()["comment_count"] == 2

    # only the author edits
    assert (
        await client.patch(
            f"/api/tasks/{task['id']}/comments/{comment['id']}", json={"body": "x"}, headers=h
        )
    ).status_code == 403
    r = await bob_client.patch(
        f"/api/tasks/{task['id']}/comments/{comment['id']}",
        json={"body": "First (edited)"},
        headers=h,
    )
    assert r.json()["body"] == "First (edited)"

    # the author or an owner deletes
    assert (
        await client.delete(f"/api/tasks/{task['id']}/comments/{comment['id']}", headers=h)
    ).status_code == 204
    assert (
        await bob_client.delete(f"/api/tasks/{task['id']}/comments/{listing[1]['id']}", headers=h)
    ).status_code == 403
    assert (await client.get(f"/api/tasks/{task['id']}", headers=h)).json()["comment_count"] == 1


async def test_comment_errors(client: AsyncClient, api: Api):
    t = await api.task("x")
    assert (
        await client.post(f"/api/tasks/{t['id']}/comments", json={"body": "   "})
    ).status_code == 422
    assert (await client.post("/api/tasks/999/comments", json={"body": "hi"})).status_code == 404
    assert (
        await client.patch(f"/api/tasks/{t['id']}/comments/999", json={"body": "hi"})
    ).status_code == 404
    assert (await client.delete(f"/api/tasks/{t['id']}/comments/999")).status_code == 404


async def test_comments_are_deleted_with_the_task(client: AsyncClient, api: Api):
    t = await api.task("x")
    await client.post(f"/api/tasks/{t['id']}/comments", json={"body": "hi"})
    await client.delete(f"/api/tasks/{t['id']}")
    assert (await client.get(f"/api/tasks/{t['id']}/comments")).status_code == 404

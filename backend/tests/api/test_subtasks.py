from httpx import AsyncClient

from tests.conftest import Api


async def test_add_update_delete_subtask(client: AsyncClient, api: Api):
    t = await api.task("Parent", subtasks=["first"])
    r = await client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "  second "})
    assert r.status_code == 201
    sub = r.json()
    assert sub["title"] == "second"
    assert sub["position"] == 1
    assert sub["is_done"] is False

    r = await client.patch(f"/api/subtasks/{sub['id']}", json={"is_done": True, "title": "2nd"})
    assert r.status_code == 200
    assert r.json() == {**sub, "is_done": True, "title": "2nd"}

    task = (await client.get(f"/api/tasks/{t['id']}")).json()
    assert [s["title"] for s in task["subtasks"]] == ["first", "2nd"]
    assert task["updated_at"] >= t["updated_at"]

    r = await client.delete(f"/api/subtasks/{sub['id']}")
    assert r.status_code == 204
    task = (await client.get(f"/api/tasks/{t['id']}")).json()
    assert [s["title"] for s in task["subtasks"]] == ["first"]


async def test_subtask_reposition(client: AsyncClient, api: Api):
    t = await api.task("Parent", subtasks=["a", "b"])
    a, _b = t["subtasks"]
    await client.patch(f"/api/subtasks/{a['id']}", json={"position": 5})
    task = (await client.get(f"/api/tasks/{t['id']}")).json()
    assert [s["title"] for s in task["subtasks"]] == ["b", "a"]


async def test_subtask_errors(client: AsyncClient, api: Api):
    assert (await client.post("/api/tasks/999/subtasks", json={"title": "x"})).status_code == 404
    assert (await client.patch("/api/subtasks/999", json={"is_done": True})).status_code == 404
    assert (await client.delete("/api/subtasks/999")).status_code == 404
    t = await api.task("p")
    assert (
        await client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": " "})
    ).status_code == 422


async def test_subtasks_deleted_with_task(client: AsyncClient, api: Api):
    t = await api.task("Parent", subtasks=["a"])
    sub_id = t["subtasks"][0]["id"]
    await client.delete(f"/api/tasks/{t['id']}")
    assert (
        await client.patch(f"/api/subtasks/{sub_id}", json={"is_done": True})
    ).status_code == 404

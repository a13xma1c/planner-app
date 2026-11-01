from httpx import AsyncClient

from tests.conftest import YESTERDAY, Api


async def test_create_and_list_with_stats(client: AsyncClient, api: Api):
    p = await api.project("Work", description="Job stuff", color="#ff8800")
    assert p["name"] == "Work"
    assert p["is_archived"] is False
    await api.task("a", project_id=p["id"])
    await api.task("b", project_id=p["id"], status="done")
    await api.task("c", project_id=p["id"], due_date=YESTERDAY.isoformat())
    await api.task("inbox task")

    r = await client.get("/api/projects")
    assert r.status_code == 200
    [row] = r.json()
    assert row["task_count"] == 3
    assert row["done_count"] == 1
    assert row["overdue_count"] == 1
    assert row["color"] == "#ff8800"


async def test_duplicate_name_case_insensitive(client: AsyncClient, api: Api):
    await api.project("Work")
    r = await client.post("/api/projects", json={"name": "work"})
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


async def test_get_update_project(client: AsyncClient, api: Api):
    p = await api.project("Old")
    r = await client.get(f"/api/projects/{p['id']}")
    assert r.json()["name"] == "Old"
    r = await client.patch(f"/api/projects/{p['id']}", json={"name": "New", "is_archived": True})
    assert r.status_code == 200
    assert r.json()["name"] == "New"
    assert r.json()["is_archived"] is True


async def test_rename_to_same_name_different_case_is_allowed(client: AsyncClient, api: Api):
    p = await api.project("Work")
    r = await client.patch(f"/api/projects/{p['id']}", json={"name": "WORK"})
    assert r.status_code == 200
    assert r.json()["name"] == "WORK"


async def test_rename_conflict(client: AsyncClient, api: Api):
    await api.project("A")
    b = await api.project("B")
    r = await client.patch(f"/api/projects/{b['id']}", json={"name": "a"})
    assert r.status_code == 409


async def test_archived_filter(client: AsyncClient, api: Api):
    await api.project("Visible")
    p = await api.project("Hidden")
    await client.patch(f"/api/projects/{p['id']}", json={"is_archived": True})
    r = await client.get("/api/projects", params={"include_archived": "false"})
    assert [x["name"] for x in r.json()] == ["Visible"]
    assert len((await client.get("/api/projects")).json()) == 2


async def test_delete_moves_tasks_to_inbox(client: AsyncClient, api: Api):
    p = await api.project("Temp")
    t = await api.task("survivor", project_id=p["id"])
    r = await client.delete(f"/api/projects/{p['id']}")
    assert r.status_code == 204
    task = (await client.get(f"/api/tasks/{t['id']}")).json()
    assert task["project_id"] is None
    assert task["project"] is None
    assert (await client.get(f"/api/projects/{p['id']}")).status_code == 404


async def test_validation(client: AsyncClient):
    assert (await client.post("/api/projects", json={"name": ""})).status_code == 422
    assert (
        await client.post("/api/projects", json={"name": "x", "color": "blue"})
    ).status_code == 422
    assert (await client.patch("/api/projects/999", json={"name": "x"})).status_code == 404
    assert (await client.delete("/api/projects/999")).status_code == 404

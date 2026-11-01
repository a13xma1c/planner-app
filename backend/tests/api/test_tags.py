from httpx import AsyncClient

from tests.conftest import Api


async def test_crud_and_counts(client: AsyncClient, api: Api):
    tag = await api.tag("#Urgent-Ish", color="#ff0000")
    assert tag["name"] == "urgent-ish"
    await api.task("a", tags=["urgent-ish"])
    await api.task("b", tags=["urgent-ish", "other"])

    r = await client.get("/api/tags")
    assert r.status_code == 200
    by_name = {t["name"]: t for t in r.json()}
    assert by_name["urgent-ish"]["task_count"] == 2
    assert by_name["other"]["task_count"] == 1
    assert by_name["urgent-ish"]["color"] == "#ff0000"

    r = await client.patch(f"/api/tags/{tag['id']}", json={"name": "Urgentish", "color": "#00ff00"})
    assert r.status_code == 200
    assert r.json()["name"] == "urgentish"

    r = await client.delete(f"/api/tags/{tag['id']}")
    assert r.status_code == 204
    tasks = (await client.get("/api/tasks")).json()
    assert all("urgentish" not in [x["name"] for x in t["tags"]] for t in tasks)


async def test_duplicate_and_conflicts(client: AsyncClient, api: Api):
    a = await api.tag("a")
    await api.tag("b")
    assert (await client.post("/api/tags", json={"name": "A"})).status_code == 409
    assert (await client.patch(f"/api/tags/{a['id']}", json={"name": "b"})).status_code == 409
    # renaming to itself is fine
    assert (await client.patch(f"/api/tags/{a['id']}", json={"name": "a"})).status_code == 200


async def test_errors(client: AsyncClient):
    assert (await client.post("/api/tags", json={"name": "two words"})).status_code == 422
    assert (await client.patch("/api/tags/999", json={"color": "#000000"})).status_code == 404
    assert (await client.delete("/api/tags/999")).status_code == 404


async def test_tags_created_implicitly_by_tasks(client: AsyncClient, api: Api):
    await api.task("x", tags=["Implicit"])
    r = await client.get("/api/tags")
    assert [t["name"] for t in r.json()] == ["implicit"]

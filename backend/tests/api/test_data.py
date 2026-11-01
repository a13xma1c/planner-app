"""Export / import round-trips and legacy migration."""

from httpx import AsyncClient

from tests.conftest import TOMORROW, Api

LEGACY = {
    "tasks": [
        {
            "id": 1,
            "title": "Renew passport",
            "project": "Admin",
            "priority": "high",
            "status": "todo",
            "due_date": "2030-05-01",
            "notes": "bring photos",
        },
        {"id": 2, "title": "Old done", "project": "Inbox", "priority": "low", "status": "done"},
        {"id": 3, "title": "Orphan", "project": "Ghost", "priority": "weird", "status": "bogus"},
        {"id": 4, "title": "Bad date", "project": "Inbox", "due_date": "31/12/2024"},
        {"id": 5, "title": "   "},
    ],
    "projects": [
        {"name": "Inbox", "description": "Default inbox"},
        {"name": "Admin", "description": "Paperwork"},
    ],
    "next_id": 6,
}


async def test_export_import_roundtrip(client: AsyncClient, api: Api):
    p = await api.project("Work", color="#112233")
    t = await api.task(
        "Full",
        project_id=p["id"],
        tags=["a", "b"],
        subtasks=["s1", "s2"],
        due_date=TOMORROW.isoformat(),
        recurrence="weekly",
        estimate_minutes=30,
        notes="n",
        priority="high",
    )
    await client.patch(f"/api/subtasks/{t['subtasks'][0]['id']}", json={"is_done": True})
    done = await api.task("Done one")
    await client.post(f"/api/tasks/{done['id']}/complete")

    r = await client.get("/api/data/export")
    assert r.status_code == 200
    bundle = r.json()
    assert bundle["version"] == 2
    assert len(bundle["tasks"]) == 2
    assert len(bundle["projects"]) == 1
    assert {x["name"] for x in bundle["tags"]} == {"a", "b"}

    # importing into a fresh state (replace) reproduces the data
    r = await client.post("/api/data/import", params={"replace": "true"}, json=bundle)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "projects": 1,
        "tags": 2,
        "tasks": 2,
        "subtasks": 2,
        "skipped": 0,
        "warnings": [],
    }
    tasks = {x["title"]: x for x in (await client.get("/api/tasks")).json()}
    full = tasks["Full"]
    assert full["project"]["name"] == "Work"
    assert full["project"]["color"] == "#112233"
    assert [x["name"] for x in full["tags"]] == ["a", "b"]
    assert [(s["title"], s["is_done"]) for s in full["subtasks"]] == [("s1", True), ("s2", False)]
    assert full["recurrence"] == "weekly"
    assert full["due_date"] == TOMORROW.isoformat()
    assert tasks["Done one"]["status"] == "done"
    assert tasks["Done one"]["completed_at"] is not None


async def test_import_merge_keeps_existing(client: AsyncClient, api: Api):
    await api.project("Work")
    await api.task("existing")
    bundle = {
        "version": 2,
        "projects": [{"id": 7, "name": "Work"}, {"id": 8, "name": "New"}],
        "tags": [],
        "tasks": [
            {"title": "imported", "project_id": 7, "tags": ["t"], "subtasks": [{"title": "s"}]},
            {"title": "", "project_id": 8},
            {
                "title": "odd",
                "status": "nope",
                "priority": "nah",
                "due_date": "x",
                "project_id": 99,
            },
        ],
    }
    r = await client.post("/api/data/import", json=bundle)
    assert r.status_code == 200
    body = r.json()
    assert body["projects"] == 1  # only "New"
    assert body["tasks"] == 2
    assert body["skipped"] == 1
    assert len(body["warnings"]) >= 3
    tasks = {x["title"]: x for x in (await client.get("/api/tasks")).json()}
    assert set(tasks) == {"existing", "imported", "odd"}
    assert tasks["imported"]["project"]["name"] == "Work"
    assert tasks["odd"]["project"] is None
    assert tasks["odd"]["status"] == "todo"
    assert len((await client.get("/api/projects")).json()) == 2


async def test_import_unsupported_version(client: AsyncClient):
    r = await client.post("/api/data/import", json={"version": 1})
    assert r.status_code == 422
    assert "version" in r.json()["detail"]


async def test_legacy_import(client: AsyncClient):
    r = await client.post("/api/data/import/legacy", json=LEGACY)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tasks"] == 4
    assert body["skipped"] == 1
    assert body["projects"] == 2  # Admin + auto-created Ghost (Inbox is built in)
    assert any("Ghost" in w for w in body["warnings"])
    assert any("31/12/2024" in w for w in body["warnings"])

    tasks = {t["title"]: t for t in (await client.get("/api/tasks")).json()}
    passport = tasks["Renew passport"]
    assert passport["project"]["name"] == "Admin"
    assert passport["priority"] == "high"
    assert passport["due_date"] == "2030-05-01"
    assert passport["notes"] == "bring photos"
    assert tasks["Old done"]["status"] == "done"
    assert tasks["Old done"]["project"] is None
    assert tasks["Old done"]["completed_at"] is not None
    assert tasks["Orphan"]["priority"] == "medium"
    assert tasks["Orphan"]["status"] == "todo"
    assert tasks["Bad date"]["due_date"] is None

    projects = {p["name"]: p for p in (await client.get("/api/projects")).json()}
    assert projects["Admin"]["description"] == "Paperwork"
    assert "Inbox" not in projects


async def test_legacy_import_is_idempotent_for_projects(client: AsyncClient):
    await client.post("/api/data/import/legacy", json=LEGACY)
    r = await client.post("/api/data/import/legacy", json=LEGACY)
    assert r.json()["projects"] == 0
    assert len((await client.get("/api/projects")).json()) == 2


async def test_legacy_import_invalid_shape(client: AsyncClient):
    r = await client.post("/api/data/import/legacy", json={"tasks": "nope"})
    assert r.status_code == 422

from datetime import timedelta

from httpx import AsyncClient

from tests.conftest import TODAY, TOMORROW, YESTERDAY, Api


async def test_empty_overview(client: AsyncClient):
    r = await client.get("/api/stats/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["completion_rate"] == 0.0
    assert body["streak_days"] == 0
    assert len(body["completed_series"]) == 14
    assert body["completed_series"][-1]["day"] == TODAY.isoformat()
    assert body["projects"] == []


async def test_overview_counts(client: AsyncClient, api: Api):
    p = await api.project("P")
    await api.task("overdue", due_date=YESTERDAY.isoformat(), priority="urgent")
    await api.task("today", due_date=TODAY.isoformat(), project_id=p["id"])
    await api.task("tomorrow", due_date=TOMORROW.isoformat())
    await api.task("far", due_date=(TODAY + timedelta(days=30)).isoformat())
    done = await api.task("done", project_id=p["id"])
    await client.post(f"/api/tasks/{done['id']}/complete")
    await api.task("done overdue ignored", status="done", due_date=YESTERDAY.isoformat())

    body = (await client.get("/api/stats/overview")).json()
    assert body["total"] == 6
    assert body["open"] == 4
    assert body["by_status"] == {"todo": 4, "in_progress": 0, "done": 2}
    assert body["by_priority"]["urgent"] == 1
    assert body["by_priority"]["medium"] == 3
    assert body["overdue"] == 1
    assert body["due_today"] == 1
    assert body["due_this_week"] == 2
    assert body["completed_today"] == 2
    assert body["completed_last_7_days"] == 2
    assert body["completion_rate"] == round(2 / 6, 3)
    assert body["streak_days"] == 1
    assert body["completed_series"][-1]["count"] == 2
    assert body["created_series"][-1]["count"] == 6
    projects = {x["name"]: x for x in body["projects"]}
    assert projects["Inbox"] == {
        "id": None,
        "name": "Inbox",
        "color": "#94a3b8",
        "total": 4,
        "done": 1,
    }
    assert projects["P"]["total"] == 2
    assert projects["P"]["done"] == 1


async def test_archived_projects_hidden_from_progress(client: AsyncClient, api: Api):
    p = await api.project("Arch")
    await api.task("x", project_id=p["id"])
    await client.patch(f"/api/projects/{p['id']}", json={"is_archived": True})
    body = (await client.get("/api/stats/overview")).json()
    assert [x["name"] for x in body["projects"]] == []

"""Task endpoints: CRUD, filtering, sorting, completion, recurrence, bulk, reorder."""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient

from tests.conftest import TODAY, TOMORROW, YESTERDAY, Api


class TestCreateAndRead:
    async def test_create_minimal(self, client: AsyncClient):
        r = await client.post("/api/tasks", json={"title": "Write tests"})
        assert r.status_code == 201
        body = r.json()
        assert body["title"] == "Write tests"
        assert body["status"] == "todo"
        assert body["priority"] == "medium"
        assert body["project"] is None
        assert body["tags"] == []
        assert body["subtasks"] == []
        assert body["is_overdue"] is False
        assert body["completed_at"] is None

    async def test_create_full(self, client: AsyncClient, api: Api):
        project = await api.project("Home")
        r = await client.post(
            "/api/tasks",
            json={
                "title": "Fix sink",
                "notes": "Call plumber if it leaks again",
                "project_id": project["id"],
                "priority": "urgent",
                "due_date": TOMORROW.isoformat(),
                "recurrence": "monthly",
                "estimate_minutes": 45,
                "tags": ["#Home", "repairs"],
                "subtasks": ["Buy wrench", "Turn off water"],
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["project"]["name"] == "Home"
        assert [t["name"] for t in body["tags"]] == ["home", "repairs"]
        assert [s["title"] for s in body["subtasks"]] == ["Buy wrench", "Turn off water"]
        assert body["recurrence"] == "monthly"
        assert body["estimate_minutes"] == 45

    async def test_create_done_sets_completed_at(self, api: Api):
        t = await api.task("x", status="done")
        assert t["completed_at"] is not None

    async def test_create_with_unknown_project_is_404(self, client: AsyncClient):
        r = await client.post("/api/tasks", json={"title": "x", "project_id": 999})
        assert r.status_code == 404

    @pytest.mark.parametrize(
        "payload",
        [
            {},
            {"title": ""},
            {"title": "   "},
            {"title": "x", "priority": "critical"},
            {"title": "x", "due_date": "not-a-date"},
            {"title": "x", "estimate_minutes": -5},
            {"title": "x", "tags": ["has space"]},
        ],
    )
    async def test_validation_errors(self, client: AsyncClient, payload: dict):
        r = await client.post("/api/tasks", json=payload)
        assert r.status_code == 422

    async def test_get_task(self, client: AsyncClient, api: Api):
        t = await api.task("Read")
        r = await client.get(f"/api/tasks/{t['id']}")
        assert r.status_code == 200
        assert r.json()["title"] == "Read"

    async def test_get_missing_task(self, client: AsyncClient):
        r = await client.get("/api/tasks/4242")
        assert r.status_code == 404
        assert "not found" in r.json()["detail"]


class TestUpdate:
    async def test_partial_update(self, client: AsyncClient, api: Api):
        t = await api.task("Old", notes="keep me")
        r = await client.patch(f"/api/tasks/{t['id']}", json={"title": "New"})
        assert r.status_code == 200
        assert r.json()["title"] == "New"
        assert r.json()["notes"] == "keep me"

    async def test_clear_due_date_explicitly(self, client: AsyncClient, api: Api):
        t = await api.task("x", due_date=TOMORROW.isoformat())
        r = await client.patch(f"/api/tasks/{t['id']}", json={"due_date": None})
        assert r.json()["due_date"] is None

    async def test_replace_tags(self, client: AsyncClient, api: Api):
        t = await api.task("x", tags=["a", "b"])
        r = await client.patch(f"/api/tasks/{t['id']}", json={"tags": ["b", "c"]})
        assert [x["name"] for x in r.json()["tags"]] == ["b", "c"]

    async def test_status_to_done_sets_completed_at_and_back(self, client: AsyncClient, api: Api):
        t = await api.task("x")
        r = await client.patch(f"/api/tasks/{t['id']}", json={"status": "done"})
        assert r.json()["completed_at"] is not None
        r = await client.patch(f"/api/tasks/{t['id']}", json={"status": "todo"})
        assert r.json()["completed_at"] is None

    async def test_move_to_project_and_back_to_inbox(self, client: AsyncClient, api: Api):
        p = await api.project("P")
        t = await api.task("x")
        r = await client.patch(f"/api/tasks/{t['id']}", json={"project_id": p["id"]})
        assert r.json()["project"]["id"] == p["id"]
        r = await client.patch(f"/api/tasks/{t['id']}", json={"project_id": None})
        assert r.json()["project"] is None

    async def test_unknown_field_rejected(self, client: AsyncClient, api: Api):
        t = await api.task("x")
        r = await client.patch(f"/api/tasks/{t['id']}", json={"nope": 1})
        assert r.status_code == 422

    async def test_update_missing(self, client: AsyncClient):
        r = await client.patch("/api/tasks/999", json={"title": "x"})
        assert r.status_code == 404

    async def test_updated_at_changes(self, client: AsyncClient, api: Api):
        t = await api.task("x")
        r = await client.patch(f"/api/tasks/{t['id']}", json={"notes": "n"})
        assert r.json()["updated_at"] >= t["updated_at"]


class TestDelete:
    async def test_delete(self, client: AsyncClient, api: Api):
        t = await api.task("x", subtasks=["s"], tags=["t"])
        r = await client.delete(f"/api/tasks/{t['id']}")
        assert r.status_code == 204
        assert (await client.get(f"/api/tasks/{t['id']}")).status_code == 404
        # tag survives, subtask cascades
        tags = (await client.get("/api/tags")).json()
        assert [x["name"] for x in tags] == ["t"]
        assert tags[0]["task_count"] == 0

    async def test_delete_missing(self, client: AsyncClient):
        assert (await client.delete("/api/tasks/999")).status_code == 404


class TestListAndFilter:
    @pytest.fixture
    async def dataset(self, api: Api) -> dict:
        work = await api.project("Work")
        home = await api.project("Home")
        t1 = await api.task(
            "Overdue urgent",
            priority="urgent",
            due_date=YESTERDAY.isoformat(),
            project_id=work["id"],
        )
        t2 = await api.task("Due today", due_date=TODAY.isoformat(), tags=["a"])
        t3 = await api.task(
            "Low later", priority="low", due_date=TOMORROW.isoformat(), tags=["a", "b"]
        )
        t4 = await api.task("Finished", status="done", project_id=home["id"])
        t5 = await api.task("No date high", priority="high", notes="mentions kitchen")
        return {"work": work, "home": home, "tasks": [t1, t2, t3, t4, t5]}

    async def test_smart_sort(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks")
        titles = [t["title"] for t in r.json()]
        assert titles == ["Overdue urgent", "No date high", "Due today", "Low later", "Finished"]

    async def test_filter_by_project(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"project_id": dataset["work"]["id"]})
        assert [t["title"] for t in r.json()] == ["Overdue urgent"]

    async def test_filter_inbox(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"inbox": "true"})
        assert {t["title"] for t in r.json()} == {"Due today", "Low later", "No date high"}

    async def test_filter_status_multi(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"status": ["done"]})
        assert [t["title"] for t in r.json()] == ["Finished"]
        r = await client.get("/api/tasks", params={"status": ["todo", "in_progress"]})
        assert len(r.json()) == 4

    async def test_exclude_done(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"include_done": "false"})
        assert "Finished" not in [t["title"] for t in r.json()]

    async def test_filter_priority(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"priority": ["urgent", "high"]})
        assert {t["title"] for t in r.json()} == {"Overdue urgent", "No date high"}

    async def test_filter_tags_is_and(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"tag": ["a"]})
        assert {t["title"] for t in r.json()} == {"Due today", "Low later"}
        r = await client.get("/api/tasks", params={"tag": ["a", "b"]})
        assert [t["title"] for t in r.json()] == ["Low later"]

    async def test_search_title_and_notes_case_insensitive(
        self, client: AsyncClient, dataset: dict
    ):
        r = await client.get("/api/tasks", params={"search": "KITCHEN"})
        assert [t["title"] for t in r.json()] == ["No date high"]
        r = await client.get("/api/tasks", params={"search": "today"})
        assert [t["title"] for t in r.json()] == ["Due today"]

    async def test_overdue_only(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"overdue": "true"})
        body = r.json()
        assert [t["title"] for t in body] == ["Overdue urgent"]
        assert body[0]["is_overdue"] is True

    async def test_due_range(self, client: AsyncClient, dataset: dict):
        r = await client.get(
            "/api/tasks", params={"due_from": TODAY.isoformat(), "due_to": TOMORROW.isoformat()}
        )
        assert {t["title"] for t in r.json()} == {"Due today", "Low later"}

    @pytest.mark.parametrize(
        ("sort", "order", "expected_first"),
        [
            ("due_date", "asc", "Overdue urgent"),
            ("due_date", "desc", "Finished"),  # nulls sort last in asc -> first in desc
            ("priority", "asc", "Overdue urgent"),
            ("priority", "desc", "Low later"),
            ("title", "asc", "Due today"),
            ("title", "desc", "Overdue urgent"),
            ("created", "asc", "Overdue urgent"),
            ("created", "desc", "No date high"),
        ],
    )
    async def test_sorts(self, client: AsyncClient, dataset: dict, sort, order, expected_first):
        r = await client.get("/api/tasks", params={"sort": sort, "order": order})
        assert r.json()[0]["title"] == expected_first

    async def test_limit(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks", params={"limit": 2})
        assert len(r.json()) == 2

    async def test_invalid_sort(self, client: AsyncClient):
        assert (await client.get("/api/tasks", params={"sort": "bogus"})).status_code == 422

    async def test_upcoming(self, client: AsyncClient, dataset: dict):
        r = await client.get("/api/tasks/upcoming", params={"days": 7})
        assert {t["title"] for t in r.json()} == {"Due today", "Low later"}


class TestCompleteAndReopen:
    async def test_complete_plain_task(self, client: AsyncClient, api: Api):
        t = await api.task("x")
        r = await client.post(f"/api/tasks/{t['id']}/complete")
        assert r.status_code == 200
        assert r.json()["task"]["status"] == "done"
        assert r.json()["task"]["completed_at"] is not None
        assert r.json()["next_task"] is None

    async def test_complete_is_idempotent(self, client: AsyncClient, api: Api):
        t = await api.task("x", recurrence="daily", due_date=TODAY.isoformat())
        first = (await client.post(f"/api/tasks/{t['id']}/complete")).json()
        assert first["next_task"] is not None
        second = (await client.post(f"/api/tasks/{t['id']}/complete")).json()
        assert second["next_task"] is None
        assert len((await client.get("/api/tasks")).json()) == 2

    async def test_complete_recurring_spawns_follow_up(self, client: AsyncClient, api: Api):
        p = await api.project("Chores")
        t = await api.task(
            "Water plants",
            recurrence="weekly",
            due_date=TODAY.isoformat(),
            project_id=p["id"],
            tags=["garden"],
            subtasks=["front", "back"],
            priority="high",
            notes="gently",
        )
        r = await client.post(f"/api/tasks/{t['id']}/complete")
        body = r.json()
        assert body["task"]["status"] == "done"
        assert body["task"]["recurrence"] is None  # chain moves to the follow-up
        nxt = body["next_task"]
        assert nxt["id"] != t["id"]
        assert nxt["status"] == "todo"
        assert nxt["due_date"] == (TODAY + timedelta(weeks=1)).isoformat()
        assert nxt["recurrence"] == "weekly"
        assert nxt["project"]["id"] == p["id"]
        assert [x["name"] for x in nxt["tags"]] == ["garden"]
        assert [s["title"] for s in nxt["subtasks"]] == ["front", "back"]
        assert all(not s["is_done"] for s in nxt["subtasks"])
        assert nxt["priority"] == "high"
        assert nxt["notes"] == "gently"

    async def test_overdue_recurring_skips_to_future(self, client: AsyncClient, api: Api):
        long_ago = (TODAY - timedelta(days=30)).isoformat()
        t = await api.task("Daily", recurrence="daily", due_date=long_ago)
        r = await client.post(f"/api/tasks/{t['id']}/complete")
        assert r.json()["next_task"]["due_date"] == TOMORROW.isoformat()

    async def test_recurring_without_due_date_uses_today(self, client: AsyncClient, api: Api):
        t = await api.task("x", recurrence="daily")
        r = await client.post(f"/api/tasks/{t['id']}/complete")
        assert r.json()["next_task"]["due_date"] == TOMORROW.isoformat()

    async def test_reopen(self, client: AsyncClient, api: Api):
        t = await api.task("x", status="done")
        r = await client.post(f"/api/tasks/{t['id']}/reopen")
        assert r.json()["status"] == "todo"
        assert r.json()["completed_at"] is None

    async def test_reopen_open_task_is_noop(self, client: AsyncClient, api: Api):
        t = await api.task("x", status="in_progress")
        r = await client.post(f"/api/tasks/{t['id']}/reopen")
        assert r.json()["status"] == "in_progress"

    async def test_complete_missing(self, client: AsyncClient):
        assert (await client.post("/api/tasks/999/complete")).status_code == 404


class TestQuickAdd:
    async def test_dry_run_does_not_create(self, client: AsyncClient, api: Api):
        await api.project("Home")
        r = await client.post(
            "/api/tasks/quick-add",
            json={"text": "Pay rent tomorrow !high #finance @home", "dry_run": True},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["task"] is None
        assert body["preview"]["title"] == "Pay rent"
        assert body["preview"]["project_name"] == "Home"  # canonical casing
        assert body["preview"]["project_id"] is not None
        assert body["preview"]["due_date"] == TOMORROW.isoformat()
        assert body["preview"]["tags"] == ["finance"]
        assert (await client.get("/api/tasks")).json() == []

    async def test_creates_task(self, client: AsyncClient):
        r = await client.post("/api/tasks/quick-add", json={"text": "Call mom today #family ~15m"})
        task = r.json()["task"]
        assert task["title"] == "Call mom"
        assert task["due_date"] == TODAY.isoformat()
        assert task["estimate_minutes"] == 15
        assert [t["name"] for t in task["tags"]] == ["family"]

    async def test_unknown_project_warns_and_uses_inbox(self, client: AsyncClient):
        r = await client.post("/api/tasks/quick-add", json={"text": "Task @Nowhere"})
        body = r.json()
        assert body["task"]["project"] is None
        assert any("Nowhere" in w for w in body["preview"]["warnings"])

    async def test_empty_text_rejected(self, client: AsyncClient):
        assert (await client.post("/api/tasks/quick-add", json={"text": ""})).status_code == 422


class TestBulk:
    @pytest.fixture
    async def ids(self, api: Api) -> list[int]:
        return [(await api.task(f"t{i}"))["id"] for i in range(3)]

    async def test_complete(self, client: AsyncClient, ids: list[int]):
        r = await client.post("/api/tasks/bulk", json={"ids": ids[:2], "action": "complete"})
        assert r.status_code == 200
        assert r.json()["affected"] == 2
        assert all(t["status"] == "done" for t in r.json()["tasks"])

    async def test_reopen(self, client: AsyncClient, ids: list[int]):
        await client.post("/api/tasks/bulk", json={"ids": ids, "action": "complete"})
        r = await client.post("/api/tasks/bulk", json={"ids": ids, "action": "reopen"})
        assert all(t["status"] == "todo" for t in r.json()["tasks"])

    async def test_delete(self, client: AsyncClient, ids: list[int]):
        r = await client.post("/api/tasks/bulk", json={"ids": ids, "action": "delete"})
        assert r.json()["affected"] == 3
        assert (await client.get("/api/tasks")).json() == []

    async def test_set_status(self, client: AsyncClient, ids: list[int]):
        r = await client.post(
            "/api/tasks/bulk", json={"ids": ids, "action": "set_status", "status": "in_progress"}
        )
        assert all(t["status"] == "in_progress" for t in r.json()["tasks"])

    async def test_set_priority(self, client: AsyncClient, ids: list[int]):
        r = await client.post(
            "/api/tasks/bulk", json={"ids": ids, "action": "set_priority", "priority": "low"}
        )
        assert all(t["priority"] == "low" for t in r.json()["tasks"])

    async def test_move_to_project(self, client: AsyncClient, api: Api, ids: list[int]):
        p = await api.project("P")
        r = await client.post(
            "/api/tasks/bulk",
            json={"ids": ids, "action": "move_to_project", "project_id": p["id"]},
        )
        assert all(t["project"]["id"] == p["id"] for t in r.json()["tasks"])

    async def test_move_to_unknown_project(self, client: AsyncClient, ids: list[int]):
        r = await client.post(
            "/api/tasks/bulk", json={"ids": ids, "action": "move_to_project", "project_id": 99}
        )
        assert r.status_code == 404

    async def test_set_due_date(self, client: AsyncClient, ids: list[int]):
        r = await client.post(
            "/api/tasks/bulk",
            json={"ids": ids, "action": "set_due_date", "due_date": TOMORROW.isoformat()},
        )
        assert all(t["due_date"] == TOMORROW.isoformat() for t in r.json()["tasks"])

    async def test_add_tag(self, client: AsyncClient, ids: list[int]):
        r = await client.post(
            "/api/tasks/bulk", json={"ids": ids, "action": "add_tag", "tag": "#Q1"}
        )
        assert all([x["name"] for x in t["tags"]] == ["q1"] for t in r.json()["tasks"])
        # idempotent
        r = await client.post(
            "/api/tasks/bulk", json={"ids": ids, "action": "add_tag", "tag": "q1"}
        )
        assert all(len(t["tags"]) == 1 for t in r.json()["tasks"])

    async def test_missing_payload_field(self, client: AsyncClient, ids: list[int]):
        r = await client.post("/api/tasks/bulk", json={"ids": ids, "action": "set_status"})
        assert r.status_code == 422

    async def test_unknown_ids_are_ignored(self, client: AsyncClient):
        r = await client.post("/api/tasks/bulk", json={"ids": [123], "action": "complete"})
        assert r.json() == {"affected": 0, "tasks": []}


class TestReorder:
    async def test_reorder_within_and_across_columns(self, client: AsyncClient, api: Api):
        a = await api.task("a")
        b = await api.task("b")
        c = await api.task("c", status="in_progress")
        r = await client.post(
            "/api/tasks/reorder",
            json={"status": "in_progress", "ordered_ids": [b["id"], c["id"], a["id"]]},
        )
        assert r.status_code == 200
        body = r.json()
        assert [t["id"] for t in body] == [b["id"], c["id"], a["id"]]
        assert [t["position"] for t in body] == [0, 1, 2]
        assert all(t["status"] == "in_progress" for t in body)

    async def test_reorder_into_done_sets_completed_at(self, client: AsyncClient, api: Api):
        a = await api.task("a")
        r = await client.post(
            "/api/tasks/reorder", json={"status": "done", "ordered_ids": [a["id"]]}
        )
        assert r.json()[0]["completed_at"] is not None

    async def test_reorder_unknown_id(self, client: AsyncClient, api: Api):
        a = await api.task("a")
        r = await client.post(
            "/api/tasks/reorder", json={"status": "todo", "ordered_ids": [a["id"], 999]}
        )
        assert r.status_code == 404

    async def test_reorder_duplicate_ids(self, client: AsyncClient, api: Api):
        a = await api.task("a")
        r = await client.post(
            "/api/tasks/reorder", json={"status": "todo", "ordered_ids": [a["id"], a["id"]]}
        )
        assert r.status_code == 422

    async def test_position_sort_reflects_order(self, client: AsyncClient, api: Api):
        a = await api.task("a")
        b = await api.task("b")
        await client.post(
            "/api/tasks/reorder", json={"status": "todo", "ordered_ids": [b["id"], a["id"]]}
        )
        r = await client.get("/api/tasks", params={"sort": "position"})
        assert [t["title"] for t in r.json()] == ["b", "a"]

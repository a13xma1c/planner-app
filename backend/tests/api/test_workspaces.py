"""Shared planners: creation, invitations, roles, scoping and member management."""

import pytest
from httpx import AsyncClient

from planner.api.deps import WORKSPACE_HEADER
from tests.conftest import Api


def ws(workspace_id: int) -> dict[str, str]:
    return {WORKSPACE_HEADER: str(workspace_id)}


@pytest.fixture
async def shared(api: Api) -> dict:
    return await api.workspace("Family")


@pytest.fixture
async def bob_in_shared(api: Api, shared: dict, bob_client: AsyncClient) -> dict:
    """Bob joins Alice's shared workspace as an editor."""
    inv = await api.invite(shared["id"], role="editor")
    r = await bob_client.post(f"/api/invitations/{inv['token']}/accept")
    assert r.status_code == 200, r.text
    return shared


class TestWorkspaces:
    async def test_personal_workspace_is_default_scope(self, client: AsyncClient, api: Api):
        await api.task("mine")
        current = (await client.get("/api/workspaces/current")).json()
        assert current["is_personal"] is True
        assert current["open_task_count"] == 1
        explicit = await client.get("/api/tasks", headers=ws(current["id"]))
        assert [t["title"] for t in explicit.json()] == ["mine"]

    async def test_create_and_list(self, client: AsyncClient, shared: dict):
        assert shared["role"] == "owner"
        assert shared["is_personal"] is False
        spaces = (await client.get("/api/workspaces")).json()
        assert [w["name"] for w in spaces] == ["Alice's planner", "Family"]

    async def test_rename_and_delete(self, client: AsyncClient, shared: dict):
        r = await client.patch(
            "/api/workspaces/current", json={"name": "Fam"}, headers=ws(shared["id"])
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Fam"
        assert (
            await client.delete("/api/workspaces/current", headers=ws(shared["id"]))
        ).status_code == 204
        assert (await client.get("/api/tasks", headers=ws(shared["id"]))).status_code == 404

    async def test_personal_workspace_cannot_be_deleted(self, client: AsyncClient):
        r = await client.delete("/api/workspaces/current")
        assert r.status_code == 422

    async def test_query_param_fallback(self, client: AsyncClient, api: Api, shared: dict):
        await client.post("/api/tasks", json={"title": "shared"}, headers=ws(shared["id"]))
        r = await client.get("/api/tasks", params={"workspace": shared["id"]})
        assert [t["title"] for t in r.json()] == ["shared"]
        assert (await client.get("/api/tasks", params={"workspace": 999})).status_code == 404

    async def test_bad_header(self, client: AsyncClient):
        assert (
            await client.get("/api/tasks", headers={WORKSPACE_HEADER: "abc"})
        ).status_code == 422
        assert (
            await client.get("/api/tasks", headers={WORKSPACE_HEADER: "999"})
        ).status_code == 404


class TestScoping:
    async def test_data_is_isolated_per_workspace(
        self, client: AsyncClient, api: Api, shared: dict
    ):
        personal = await api.task("personal")
        r = await client.post("/api/tasks", json={"title": "shared"}, headers=ws(shared["id"]))
        shared_task = r.json()
        assert [t["title"] for t in (await client.get("/api/tasks")).json()] == ["personal"]
        assert [
            t["title"] for t in (await client.get("/api/tasks", headers=ws(shared["id"]))).json()
        ] == ["shared"]
        # ids from another workspace are invisible, even to the same user
        assert (await client.get(f"/api/tasks/{shared_task['id']}")).status_code == 404
        assert (
            await client.get(f"/api/tasks/{personal['id']}", headers=ws(shared["id"]))
        ).status_code == 404
        assert (
            await client.patch(
                f"/api/tasks/{personal['id']}", json={"title": "x"}, headers=ws(shared["id"])
            )
        ).status_code == 404

    async def test_non_members_get_404(self, bob_client: AsyncClient, shared: dict):
        assert (await bob_client.get("/api/tasks", headers=ws(shared["id"]))).status_code == 404
        assert (
            await bob_client.get("/api/workspaces/current", headers=ws(shared["id"]))
        ).status_code == 404

    async def test_projects_and_tags_are_per_workspace(
        self, client: AsyncClient, api: Api, shared: dict
    ):
        await api.project("Work")
        r = await client.post("/api/projects", json={"name": "Work"}, headers=ws(shared["id"]))
        assert r.status_code == 201  # same name allowed in another workspace
        await api.tag("home")
        assert (
            await client.post("/api/tags", json={"name": "home"}, headers=ws(shared["id"]))
        ).status_code == 201
        assert len((await client.get("/api/tags")).json()) == 1
        # a project from another workspace cannot be referenced
        personal_project = (await client.get("/api/projects")).json()[0]
        r = await client.post(
            "/api/tasks",
            json={"title": "x", "project_id": personal_project["id"]},
            headers=ws(shared["id"]),
        )
        assert r.status_code == 404

    async def test_subtasks_follow_task_scope(self, client: AsyncClient, api: Api, shared: dict):
        t = await api.task("p", subtasks=["s"])
        sub_id = t["subtasks"][0]["id"]
        assert (
            await client.patch(
                f"/api/subtasks/{sub_id}", json={"is_done": True}, headers=ws(shared["id"])
            )
        ).status_code == 404

    async def test_export_and_stats_are_scoped(self, client: AsyncClient, api: Api, shared: dict):
        await api.task("personal")
        bundle = (await client.get("/api/data/export", headers=ws(shared["id"]))).json()
        assert bundle["tasks"] == []
        assert (await client.get("/api/stats/overview", headers=ws(shared["id"]))).json()[
            "total"
        ] == 0


class TestInvitations:
    async def test_invite_preview_accept(
        self,
        client: AsyncClient,
        api: Api,
        shared: dict,
        bob_client: AsyncClient,
        anon: AsyncClient,
    ):
        inv = await api.invite(shared["id"], role="viewer", expires_in_days=3, max_uses=1)
        assert inv["is_valid"] is True
        assert inv["use_count"] == 0

        preview = await anon.get(f"/api/invitations/{inv['token']}")
        assert preview.status_code == 200
        assert preview.json() == {
            "workspace_name": "Family",
            "role": "viewer",
            "invited_by": "Alice",
            "member_count": 1,
            "is_valid": True,
            "email": None,
        }
        assert (await anon.post(f"/api/invitations/{inv['token']}/accept")).status_code == 401

        r = await bob_client.post(f"/api/invitations/{inv['token']}/accept")
        assert r.status_code == 200
        assert r.json()["role"] == "viewer"
        assert r.json()["member_count"] == 2
        # accepting twice is harmless and doesn't consume another use
        assert (await bob_client.post(f"/api/invitations/{inv['token']}/accept")).status_code == 200
        invites = (
            await client.get("/api/workspaces/current/invitations", headers=ws(shared["id"]))
        ).json()
        assert invites[0]["use_count"] == 1
        assert invites[0]["is_valid"] is False  # max_uses reached

    async def test_unknown_revoked_and_expired_tokens(
        self, client: AsyncClient, api: Api, shared: dict, bob_client: AsyncClient
    ):
        assert (await bob_client.get("/api/invitations/nope")).status_code == 404
        inv = await api.invite(shared["id"])
        r = await client.delete(
            f"/api/workspaces/current/invitations/{inv['id']}", headers=ws(shared["id"])
        )
        assert r.status_code == 204
        assert (await bob_client.get(f"/api/invitations/{inv['token']}")).json()[
            "is_valid"
        ] is False
        r = await bob_client.post(f"/api/invitations/{inv['token']}/accept")
        assert r.status_code == 409
        assert (
            await client.delete("/api/workspaces/current/invitations/999", headers=ws(shared["id"]))
        ).status_code == 404

    async def test_email_restricted_invite(self, api: Api, shared: dict, bob_client: AsyncClient):
        inv = await api.invite(shared["id"], email="Someone-Else@example.com")
        r = await bob_client.post(f"/api/invitations/{inv['token']}/accept")
        assert r.status_code == 403
        assert "someone-else@example.com" in r.json()["detail"]
        inv = await api.invite(shared["id"], email="bob@example.com")
        assert (await bob_client.post(f"/api/invitations/{inv['token']}/accept")).status_code == 200

    async def test_cannot_invite_to_personal_or_as_owner(self, client: AsyncClient, shared: dict):
        assert (
            await client.post("/api/workspaces/current/invitations", json={"role": "editor"})
        ).status_code == 422
        r = await client.post(
            "/api/workspaces/current/invitations", json={"role": "owner"}, headers=ws(shared["id"])
        )
        assert r.status_code == 422

    async def test_only_owners_manage_invitations(
        self, bob_client: AsyncClient, bob_in_shared: dict
    ):
        h = ws(bob_in_shared["id"])
        assert (
            await bob_client.get("/api/workspaces/current/invitations", headers=h)
        ).status_code == 403
        assert (
            await bob_client.post("/api/workspaces/current/invitations", json={}, headers=h)
        ).status_code == 403


class TestRoles:
    async def test_viewer_is_read_only(
        self, client: AsyncClient, api: Api, shared: dict, bob_client: AsyncClient
    ):
        inv = await api.invite(shared["id"], role="viewer")
        await bob_client.post(f"/api/invitations/{inv['token']}/accept")
        h = ws(shared["id"])
        t = (await client.post("/api/tasks", json={"title": "read me"}, headers=h)).json()
        assert (await bob_client.get("/api/tasks", headers=h)).status_code == 200
        assert (await bob_client.get(f"/api/tasks/{t['id']}", headers=h)).status_code == 200
        for method, path, body in [
            ("post", "/api/tasks", {"title": "x"}),
            ("patch", f"/api/tasks/{t['id']}", {"title": "x"}),
            ("delete", f"/api/tasks/{t['id']}", None),
            ("post", f"/api/tasks/{t['id']}/complete", None),
            ("post", "/api/tasks/quick-add", {"text": "x"}),
            ("post", "/api/projects", {"name": "x"}),
            ("post", "/api/tags", {"name": "x"}),
            ("post", f"/api/tasks/{t['id']}/comments", {"body": "x"}),
            ("post", "/api/data/import", {"version": 2}),
        ]:
            r = await getattr(bob_client, method)(
                path, **({"json": body} if body is not None else {}), headers=h
            )
            assert r.status_code == 403, (method, path, r.text)
            assert "editor" in r.json()["detail"]

    async def test_editor_can_edit_but_not_manage(
        self, bob_client: AsyncClient, bob_in_shared: dict, user
    ):
        h = ws(bob_in_shared["id"])
        assert (
            await bob_client.post("/api/tasks", json={"title": "ok"}, headers=h)
        ).status_code == 201
        assert (
            await bob_client.patch("/api/workspaces/current", json={"name": "x"}, headers=h)
        ).status_code == 403
        assert (await bob_client.delete("/api/workspaces/current", headers=h)).status_code == 403
        r = await bob_client.patch(
            f"/api/workspaces/current/members/{user.id}", json={"role": "viewer"}, headers=h
        )
        assert r.status_code == 403

    async def test_owner_manages_members(
        self, client: AsyncClient, bob_in_shared: dict, bob, bob_client: AsyncClient
    ):
        h = ws(bob_in_shared["id"])
        members = (await client.get("/api/workspaces/current/members", headers=h)).json()
        assert [(m["user"]["display_name"], m["role"]) for m in members] == [
            ("Alice", "owner"),
            ("Bob", "editor"),
        ]

        r = await client.patch(
            f"/api/workspaces/current/members/{bob.id}", json={"role": "owner"}, headers=h
        )
        assert r.json()["role"] == "owner"
        # now Alice can step down since Bob is also an owner
        alice_id = members[0]["user"]["id"]
        r = await client.patch(
            f"/api/workspaces/current/members/{alice_id}", json={"role": "viewer"}, headers=h
        )
        assert r.status_code == 200
        # ...and Bob (owner) cannot demote himself as the last owner
        r = await bob_client.patch(
            f"/api/workspaces/current/members/{bob.id}", json={"role": "editor"}, headers=h
        )
        assert r.status_code == 422
        assert "at least one owner" in r.json()["detail"]

        assert (
            await bob_client.delete(f"/api/workspaces/current/members/{alice_id}", headers=h)
        ).status_code == 204
        assert (await client.get("/api/tasks", headers=h)).status_code == 404
        assert (
            await bob_client.patch(
                "/api/workspaces/current/members/999", json={"role": "viewer"}, headers=h
            )
        ).status_code == 404

    async def test_leaving(
        self, client: AsyncClient, bob_client: AsyncClient, bob_in_shared: dict, bob, user
    ):
        h = ws(bob_in_shared["id"])
        # the only owner can't leave
        r = await client.delete(f"/api/workspaces/current/members/{user.id}", headers=h)
        assert r.status_code == 422
        # an editor can leave on their own
        assert (
            await bob_client.delete(f"/api/workspaces/current/members/{bob.id}", headers=h)
        ).status_code == 204
        assert (await bob_client.get("/api/tasks", headers=h)).status_code == 404
        # nobody can leave their personal planner
        personal = (await client.get("/api/workspaces/current")).json()
        r = await client.delete(
            f"/api/workspaces/current/members/{user.id}", headers=ws(personal["id"])
        )
        assert r.status_code == 422


class TestAssignees:
    async def test_assign_member_and_filter(
        self, client: AsyncClient, bob_client: AsyncClient, bob_in_shared: dict, bob, user
    ):
        h = ws(bob_in_shared["id"])
        r = await client.post(
            "/api/tasks", json={"title": "for bob", "assignee_id": bob.id}, headers=h
        )
        assert r.status_code == 201
        assert r.json()["assignee"] == {"id": bob.id, "display_name": "Bob"}
        assert r.json()["created_by"] == {"id": user.id, "display_name": "Alice"}
        await client.post("/api/tasks", json={"title": "nobody"}, headers=h)

        mine = await bob_client.get("/api/tasks", params={"assigned_to_me": "true"}, headers=h)
        assert [t["title"] for t in mine.json()] == ["for bob"]
        by_id = await client.get("/api/tasks", params={"assignee_id": bob.id}, headers=h)
        assert [t["title"] for t in by_id.json()] == ["for bob"]
        unassigned = await client.get("/api/tasks", params={"unassigned": "true"}, headers=h)
        assert [t["title"] for t in unassigned.json()] == ["nobody"]

        stats = (await client.get("/api/stats/overview", headers=h)).json()
        assert [(m["user"] and m["user"]["display_name"], m["open"]) for m in stats["members"]] == [
            ("Alice", 0),
            ("Bob", 1),
            (None, 1),
        ]

    async def test_assignee_must_be_a_member(self, client: AsyncClient, api: Api, bob):
        r = await client.post("/api/tasks", json={"title": "x", "assignee_id": bob.id})
        assert r.status_code == 422
        assert "member" in r.json()["detail"]
        t = await api.task("y")
        assert (
            await client.patch(f"/api/tasks/{t['id']}", json={"assignee_id": 999})
        ).status_code == 422

    async def test_bulk_assign_and_recurrence_keeps_assignee(
        self, client: AsyncClient, bob_client: AsyncClient, bob_in_shared: dict, bob
    ):
        h = ws(bob_in_shared["id"])
        ids = [
            (
                await client.post(
                    "/api/tasks", json={"title": f"t{i}", "recurrence": "daily"}, headers=h
                )
            ).json()["id"]
            for i in range(2)
        ]
        r = await client.post(
            "/api/tasks/bulk",
            json={"ids": ids, "action": "assign", "assignee_id": bob.id},
            headers=h,
        )
        assert all(t["assignee"]["id"] == bob.id for t in r.json()["tasks"])
        nxt = (await bob_client.post(f"/api/tasks/{ids[0]}/complete", headers=h)).json()[
            "next_task"
        ]
        assert nxt["assignee"]["id"] == bob.id
        r = await client.post(
            "/api/tasks/bulk", json={"ids": ids, "action": "assign", "assignee_id": None}, headers=h
        )
        assert all(t["assignee"] is None for t in r.json()["tasks"])

    async def test_personal_stats_have_no_member_breakdown(self, client: AsyncClient, api: Api):
        await api.task("x")
        assert (await client.get("/api/stats/overview")).json()["members"] == []

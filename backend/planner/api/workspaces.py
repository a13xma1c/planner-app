"""Workspaces (planners), members and invitations."""

from __future__ import annotations

from fastapi import APIRouter, Request, status

from planner.api.deps import (
    WORKSPACE_HEADER,
    CurrentUser,
    OwnerCtx,
    SessionDep,
    ViewerCtx,
    WorkspaceContext,
    get_broadcaster,
)
from planner.models import Membership, Role, Workspace
from planner.schemas import (
    InvitationCreate,
    InvitationPreview,
    InvitationRead,
    MemberRead,
    MemberUpdate,
    UserPublic,
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceSummary,
    WorkspaceUpdate,
)
from planner.services import workspaces as svc
from planner.services.events import Event

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _summary(ws: Workspace, role: Role, members: int, open_tasks: int) -> WorkspaceSummary:
    return WorkspaceSummary(
        **WorkspaceRead.model_validate(ws).model_dump(),
        role=role,
        member_count=members,
        open_task_count=open_tasks,
    )


def _member(m: Membership) -> MemberRead:
    return MemberRead(user=UserPublic.model_validate(m.user), role=m.role, joined_at=m.joined_at)


def _notify_members(request: Request, ctx: WorkspaceContext) -> None:
    get_broadcaster(request).publish(
        Event(kind="changed", entity="members", workspace_id=ctx.id, actor_id=ctx.user.id)
    )


@router.get("", response_model=list[WorkspaceSummary])
async def list_workspaces(session: SessionDep, user: CurrentUser) -> list[WorkspaceSummary]:
    rows = await svc.list_for_user(session, user.id)
    return [_summary(ws, m.role, members, open_tasks) for ws, m, members, open_tasks in rows]


@router.post("", response_model=WorkspaceSummary, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    session: SessionDep, user: CurrentUser, payload: WorkspaceCreate
) -> WorkspaceSummary:
    ws = await svc.create_workspace(session, user, payload)
    return _summary(ws, Role.OWNER, 1, 0)


@router.get("/current", response_model=WorkspaceSummary)
async def current_workspace(session: SessionDep, ctx: ViewerCtx) -> WorkspaceSummary:
    """The workspace selected by the ``X-Workspace-Id`` header (or the personal one)."""
    rows = await svc.list_for_user(session, ctx.user.id)
    for ws, m, members, open_tasks in rows:
        if ws.id == ctx.id:
            return _summary(ws, m.role, members, open_tasks)
    raise AssertionError("membership vanished")  # pragma: no cover


@router.patch("/current", response_model=WorkspaceRead)
async def update_workspace(
    request: Request, session: SessionDep, ctx: OwnerCtx, payload: WorkspaceUpdate
) -> WorkspaceRead:
    ws = await svc.update_workspace(session, ctx.workspace, payload)
    _notify_members(request, ctx)
    return WorkspaceRead.model_validate(ws)


@router.delete("/current", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(session: SessionDep, ctx: OwnerCtx) -> None:
    await svc.delete_workspace(session, ctx.workspace)


# ── members ──────────────────────────────────────────────────────────────────


@router.get("/current/members", response_model=list[MemberRead])
async def list_members(session: SessionDep, ctx: ViewerCtx) -> list[MemberRead]:
    return [_member(m) for m in await svc.list_members(session, ctx.id)]


@router.patch("/current/members/{user_id}", response_model=MemberRead)
async def update_member(
    request: Request, session: SessionDep, ctx: OwnerCtx, user_id: int, payload: MemberUpdate
) -> MemberRead:
    membership = await svc.update_member_role(session, ctx.workspace, user_id, payload.role)
    _notify_members(request, ctx)
    return _member(membership)


@router.delete("/current/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    request: Request, session: SessionDep, ctx: ViewerCtx, user_id: int
) -> None:
    """Owners may remove anyone; members may remove themselves (leave)."""
    await svc.remove_member(session, ctx.workspace, ctx.membership, user_id)
    _notify_members(request, ctx)


# ── invitations ──────────────────────────────────────────────────────────────


@router.get("/current/invitations", response_model=list[InvitationRead])
async def list_invitations(session: SessionDep, ctx: OwnerCtx) -> list[InvitationRead]:
    return [InvitationRead.model_validate(i) for i in await svc.list_invitations(session, ctx.id)]


@router.post(
    "/current/invitations", response_model=InvitationRead, status_code=status.HTTP_201_CREATED
)
async def create_invitation(
    session: SessionDep, ctx: OwnerCtx, payload: InvitationCreate
) -> InvitationRead:
    inv = await svc.create_invitation(session, ctx.workspace, ctx.user, payload)
    return InvitationRead.model_validate(inv)


@router.delete("/current/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(session: SessionDep, ctx: OwnerCtx, invitation_id: int) -> None:
    await svc.revoke_invitation(session, ctx.id, invitation_id)


# ── joining (no workspace header: the token identifies the workspace) ────────

join_router = APIRouter(prefix="/invitations", tags=["workspaces"])


@join_router.get("/{token}", response_model=InvitationPreview)
async def preview_invitation(session: SessionDep, token: str) -> InvitationPreview:
    return await svc.preview_invitation(session, token)


@join_router.post("/{token}/accept", response_model=WorkspaceSummary)
async def accept_invitation(
    request: Request, session: SessionDep, user: CurrentUser, token: str
) -> WorkspaceSummary:
    membership = await svc.accept_invitation(session, token, user)
    rows = await svc.list_for_user(session, user.id)
    get_broadcaster(request).publish(
        Event(
            kind="changed", entity="members", workspace_id=membership.workspace_id, actor_id=user.id
        )
    )
    for ws, m, members, open_tasks in rows:
        if ws.id == membership.workspace_id:
            return _summary(ws, m.role, members, open_tasks)
    raise AssertionError("membership vanished")  # pragma: no cover


__all__ = ["WORKSPACE_HEADER", "join_router", "router"]

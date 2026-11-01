"""Workspaces (planners), membership, roles and invitation links."""

from __future__ import annotations

import secrets
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import (
    ROLE_RANK,
    Invitation,
    Membership,
    Role,
    Status,
    Task,
    User,
    Workspace,
    utcnow,
)
from planner.schemas import InvitationCreate, InvitationPreview, WorkspaceCreate, WorkspaceUpdate
from planner.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError


def has_role(membership: Membership, minimum: Role) -> bool:
    return ROLE_RANK[membership.role] >= ROLE_RANK[minimum]


# ── lookup ───────────────────────────────────────────────────────────────────


async def get_membership(
    session: AsyncSession, workspace_id: int, user_id: int
) -> Membership | None:
    return await session.scalar(
        select(Membership).where(
            Membership.workspace_id == workspace_id, Membership.user_id == user_id
        )
    )


async def require_membership(
    session: AsyncSession, workspace_id: int, user_id: int, *, minimum: Role = Role.VIEWER
) -> tuple[Workspace, Membership]:
    """Load a workspace the user belongs to, enforcing a minimum role.

    Non-members get a 404 rather than a 403 so workspace ids can't be probed.
    """
    membership = await get_membership(session, workspace_id, user_id)
    if membership is None:
        raise NotFoundError(f"Workspace {workspace_id} not found")
    if not has_role(membership, minimum):
        raise ForbiddenError(f"This action requires the {minimum.value} role")
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:  # pragma: no cover - FK guarantees existence
        raise NotFoundError(f"Workspace {workspace_id} not found")
    return workspace, membership


async def personal_workspace(session: AsyncSession, user_id: int) -> Workspace:
    ws = await session.scalar(
        select(Workspace)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Membership.user_id == user_id, Workspace.is_personal.is_(True))
        .order_by(Workspace.id)
        .limit(1)
    )
    if ws is None:  # pragma: no cover - every user gets one at registration
        raise NotFoundError("Personal workspace not found")
    return ws


async def list_for_user(
    session: AsyncSession, user_id: int
) -> list[tuple[Workspace, Membership, int, int]]:
    """``(workspace, membership, member_count, open_task_count)`` for every workspace."""
    rows = (
        await session.execute(
            select(Workspace, Membership)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.user_id == user_id)
            .order_by(Workspace.is_personal.desc(), Workspace.name)
        )
    ).all()
    ids = [ws.id for ws, _ in rows]
    members = dict(
        (
            await session.execute(
                select(Membership.workspace_id, func.count(Membership.id))
                .where(Membership.workspace_id.in_(ids))
                .group_by(Membership.workspace_id)
            )
        ).all()
    )
    open_tasks = dict(
        (
            await session.execute(
                select(Task.workspace_id, func.count(Task.id))
                .where(Task.workspace_id.in_(ids), Task.status != Status.DONE)
                .group_by(Task.workspace_id)
            )
        ).all()
    )
    return [(ws, m, int(members.get(ws.id, 1)), int(open_tasks.get(ws.id, 0))) for ws, m in rows]


# ── CRUD ─────────────────────────────────────────────────────────────────────


async def create_workspace(session: AsyncSession, user: User, data: WorkspaceCreate) -> Workspace:
    workspace = Workspace(name=data.name, is_personal=False, created_by_id=user.id)
    session.add(workspace)
    await session.flush()
    session.add(Membership(workspace_id=workspace.id, user_id=user.id, role=Role.OWNER))
    await session.commit()
    await session.refresh(workspace)
    return workspace


async def update_workspace(
    session: AsyncSession, workspace: Workspace, data: WorkspaceUpdate
) -> Workspace:
    for key, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(workspace, key, value)
    await session.commit()
    await session.refresh(workspace)
    return workspace


async def delete_workspace(session: AsyncSession, workspace: Workspace) -> None:
    if workspace.is_personal:
        raise ValidationError("Personal planners cannot be deleted")
    await session.delete(workspace)
    await session.commit()


# ── members ──────────────────────────────────────────────────────────────────


async def list_members(session: AsyncSession, workspace_id: int) -> Sequence[Membership]:
    return (
        await session.scalars(
            select(Membership)
            .join(User, User.id == Membership.user_id)
            .where(Membership.workspace_id == workspace_id)
            .order_by(Membership.joined_at, Membership.id)
        )
    ).all()


async def _owner_count(session: AsyncSession, workspace_id: int) -> int:
    return int(
        await session.scalar(
            select(func.count(Membership.id)).where(
                Membership.workspace_id == workspace_id, Membership.role == Role.OWNER
            )
        )
        or 0
    )


async def update_member_role(
    session: AsyncSession, workspace: Workspace, user_id: int, role: Role
) -> Membership:
    membership = await get_membership(session, workspace.id, user_id)
    if membership is None:
        raise NotFoundError("Member not found")
    if workspace.is_personal and membership.role == Role.OWNER:
        raise ValidationError("The owner of a personal planner cannot change role")
    if (
        membership.role == Role.OWNER
        and role != Role.OWNER
        and await _owner_count(session, workspace.id) <= 1
    ):
        raise ValidationError("A planner needs at least one owner")
    membership.role = role
    await session.commit()
    await session.refresh(membership)
    return membership


async def remove_member(
    session: AsyncSession, workspace: Workspace, actor: Membership, user_id: int
) -> None:
    """Owners can remove anyone; any member can remove themselves (leave)."""
    if actor.user_id != user_id and actor.role != Role.OWNER:
        raise ForbiddenError("Only owners can remove other members")
    membership = await get_membership(session, workspace.id, user_id)
    if membership is None:
        raise NotFoundError("Member not found")
    if workspace.is_personal and membership.role == Role.OWNER:
        raise ValidationError("You cannot leave your personal planner")
    if membership.role == Role.OWNER and await _owner_count(session, workspace.id) <= 1:
        raise ValidationError("Transfer ownership before leaving: a planner needs an owner")
    await session.delete(membership)
    await session.commit()


# ── invitations ──────────────────────────────────────────────────────────────


async def create_invitation(
    session: AsyncSession, workspace: Workspace, actor: User, data: InvitationCreate
) -> Invitation:
    if workspace.is_personal:
        raise ValidationError("Create a shared planner to invite people")
    invitation = Invitation(
        workspace_id=workspace.id,
        token=secrets.token_urlsafe(24),
        role=data.role,
        email=data.email,
        created_by_id=actor.id,
        expires_at=utcnow() + timedelta(days=data.expires_in_days),
        max_uses=data.max_uses,
    )
    session.add(invitation)
    await session.commit()
    await session.refresh(invitation)
    return invitation


async def list_invitations(session: AsyncSession, workspace_id: int) -> Sequence[Invitation]:
    return (
        await session.scalars(
            select(Invitation)
            .where(Invitation.workspace_id == workspace_id)
            .order_by(Invitation.created_at.desc())
        )
    ).all()


async def revoke_invitation(session: AsyncSession, workspace_id: int, invitation_id: int) -> None:
    invitation = await session.get(Invitation, invitation_id)
    if invitation is None or invitation.workspace_id != workspace_id:
        raise NotFoundError("Invitation not found")
    invitation.revoked_at = utcnow()
    await session.commit()


async def get_invitation(session: AsyncSession, token: str) -> Invitation:
    invitation = await session.scalar(select(Invitation).where(Invitation.token == token))
    if invitation is None:
        raise NotFoundError("This invitation link is not valid")
    return invitation


async def preview_invitation(session: AsyncSession, token: str) -> InvitationPreview:
    invitation = await get_invitation(session, token)
    inviter = (
        await session.get(User, invitation.created_by_id) if invitation.created_by_id else None
    )
    member_count = int(
        await session.scalar(
            select(func.count(Membership.id)).where(
                Membership.workspace_id == invitation.workspace_id
            )
        )
        or 0
    )
    return InvitationPreview(
        workspace_name=invitation.workspace.name,
        role=invitation.role,
        invited_by=inviter.display_name if inviter else None,
        member_count=member_count,
        is_valid=invitation.is_valid,
        email=invitation.email,
    )


async def accept_invitation(session: AsyncSession, token: str, user: User) -> Membership:
    invitation = await get_invitation(session, token)
    existing = await get_membership(session, invitation.workspace_id, user.id)
    if existing is not None:
        return existing  # joining twice is a no-op, even once the link is used up
    if not invitation.is_valid:
        raise ConflictError("This invitation link has expired or been revoked")
    if invitation.email and invitation.email != user.email:
        raise ForbiddenError(f"This invitation was issued to {invitation.email}")
    membership = Membership(
        workspace_id=invitation.workspace_id, user_id=user.id, role=invitation.role
    )
    invitation.use_count += 1
    session.add(membership)
    await session.commit()
    await session.refresh(membership)
    return membership

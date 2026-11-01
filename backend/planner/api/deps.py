"""FastAPI dependencies: database session, current user, current workspace + role."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Coroutine
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from planner.db import Database
from planner.models import Membership, Role, Session, User, Workspace
from planner.services import auth, workspaces
from planner.services.errors import ForbiddenError, UnauthorizedError, ValidationError
from planner.services.events import Broadcaster, Event

SESSION_COOKIE = "planner_session"
WORKSPACE_HEADER = "X-Workspace-Id"


def get_db(request: Request) -> Database:
    db: Database = request.app.state.db
    return db


async def get_session(db: Annotated[Database, Depends(get_db)]) -> AsyncIterator[AsyncSession]:
    async with db.session_factory() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


# ── authentication ───────────────────────────────────────────────────────────


async def get_auth(request: Request, session: SessionDep) -> tuple[User, Session]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise UnauthorizedError("Not signed in")
    resolved = await auth.resolve_session(session, token)
    if resolved is None:
        raise UnauthorizedError("Your session has expired, please sign in again")
    return resolved


async def get_current_user(auth_pair: Annotated[tuple[User, Session], Depends(get_auth)]) -> User:
    return auth_pair[0]


CurrentUser = Annotated[User, Depends(get_current_user)]
AuthPair = Annotated[tuple[User, Session], Depends(get_auth)]


# ── workspace scoping ────────────────────────────────────────────────────────


@dataclass(slots=True)
class WorkspaceContext:
    """The workspace a request operates on, plus the caller's membership."""

    workspace: Workspace
    membership: Membership
    user: User

    @property
    def id(self) -> int:
        return self.workspace.id

    def has_role(self, minimum: Role) -> bool:
        return workspaces.has_role(self.membership, minimum)


async def get_workspace_context(
    request: Request, session: SessionDep, user: CurrentUser
) -> WorkspaceContext:
    """Resolve the workspace from the ``X-Workspace-Id`` header (default: personal).

    The ``workspace`` query parameter is accepted as a fallback for clients that cannot
    set headers (``EventSource``).
    """
    raw = request.headers.get(WORKSPACE_HEADER) or request.query_params.get("workspace")
    if raw:
        try:
            workspace_id = int(raw)
        except ValueError as exc:
            raise ValidationError(f"Invalid {WORKSPACE_HEADER} header") from exc
    else:
        workspace_id = (await workspaces.personal_workspace(session, user.id)).id
    workspace, membership = await workspaces.require_membership(session, workspace_id, user.id)
    return WorkspaceContext(workspace=workspace, membership=membership, user=user)


def require_role(
    minimum: Role,
) -> Callable[[WorkspaceContext], Coroutine[Any, Any, WorkspaceContext]]:
    async def dependency(
        ctx: Annotated[WorkspaceContext, Depends(get_workspace_context)],
    ) -> WorkspaceContext:
        if not ctx.has_role(minimum):
            raise ForbiddenError(f"This action requires the {minimum.value} role")
        return ctx

    return dependency


ViewerCtx = Annotated[WorkspaceContext, Depends(get_workspace_context)]
EditorCtx = Annotated[WorkspaceContext, Depends(require_role(Role.EDITOR))]
OwnerCtx = Annotated[WorkspaceContext, Depends(require_role(Role.OWNER))]


# ── change notifications ─────────────────────────────────────────────────────


def get_broadcaster(request: Request) -> Broadcaster:
    broadcaster: Broadcaster = request.app.state.broadcaster
    return broadcaster


class Notifier:
    """Publishes "changed" events for the current workspace after mutations."""

    def __init__(self, broadcaster: Broadcaster, ctx: WorkspaceContext) -> None:
        self._broadcaster = broadcaster
        self._ctx = ctx

    def __call__(self, entity: str, **data: Any) -> None:
        self._broadcaster.publish(
            Event(
                kind="changed",
                entity=entity,
                workspace_id=self._ctx.id,
                actor_id=self._ctx.user.id,
                data=data,
            )
        )


def get_notifier(
    broadcaster: Annotated[Broadcaster, Depends(get_broadcaster)], ctx: ViewerCtx
) -> Notifier:
    return Notifier(broadcaster, ctx)


Notify = Annotated[Notifier, Depends(get_notifier)]

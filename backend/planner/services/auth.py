"""Accounts and cookie sessions."""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Sequence
from datetime import timedelta

from pwdlib import PasswordHash
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import Membership, Role, Session, User, Workspace, utcnow
from planner.schemas import PasswordChange, ProfileUpdate, RegisterRequest
from planner.services import passwords
from planner.services.errors import ConflictError, ForbiddenError, ValidationError

SESSION_TTL = timedelta(days=30)
SESSION_TOUCH_INTERVAL = timedelta(hours=1)

_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _hasher.verify(password, password_hash)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def require_acceptable_password(
    password: str, *, email: str | None = None, display_name: str | None = None
) -> None:
    """Raise ``ValidationError`` (HTTP 422) unless the password satisfies the policy."""
    problem = passwords.evaluate(password, email=email, display_name=display_name).problem()
    if problem is not None:
        raise ValidationError(problem)


# ── registration / login ─────────────────────────────────────────────────────


async def user_count(session: AsyncSession) -> int:
    return int(await session.scalar(select(func.count(User.id))) or 0)


async def register(session: AsyncSession, data: RegisterRequest) -> User:
    """Create a user with a personal workspace.

    The very first user adopts any workspace left over from the single-user era
    (created by the migration, see ``alembic/versions/0002``) as their personal planner.
    """
    if await session.scalar(select(User).where(User.email == data.email)) is not None:
        raise ConflictError("An account with this email already exists")
    require_acceptable_password(data.password, email=data.email, display_name=data.display_name)
    user = User(
        email=data.email,
        display_name=data.display_name,
        password_hash=hash_password(data.password),
    )
    session.add(user)
    await session.flush()

    orphan: Workspace | None = None
    if await user_count(session) == 1:
        orphan = await session.scalar(
            select(Workspace)
            .outerjoin(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.id.is_(None), Workspace.is_personal.is_(True))
            .order_by(Workspace.id)
            .limit(1)
        )
    if orphan is not None:
        orphan.created_by_id = user.id
        workspace = orphan
    else:
        workspace = Workspace(name=f"{user.display_name}'s planner", is_personal=True)
        workspace.created_by_id = user.id
        session.add(workspace)
        await session.flush()
    session.add(Membership(workspace_id=workspace.id, user_id=user.id, role=Role.OWNER))
    await session.commit()
    await session.refresh(user)
    return user


async def authenticate(session: AsyncSession, email: str, password: str) -> User | None:
    user = await session.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not user.is_active:
        # burn time so the response doesn't reveal whether the email exists
        verify_password(password, hash_password("dummy-password"))
        return None
    return user if verify_password(password, user.password_hash) else None


async def create_session(session: AsyncSession, user: User, *, user_agent: str = "") -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        Session(
            token_hash=_token_hash(token),
            user_id=user.id,
            expires_at=utcnow() + SESSION_TTL,
            user_agent=user_agent[:255],
        )
    )
    await session.commit()
    return token


async def resolve_session(session: AsyncSession, token: str) -> tuple[User, Session] | None:
    """Return the user for a cookie token, sliding the expiry forward on use."""
    row = await session.scalar(select(Session).where(Session.token_hash == _token_hash(token)))
    now = utcnow()
    if row is None or row.expires_at <= now or not row.user.is_active:
        return None
    if now - row.last_seen_at > SESSION_TOUCH_INTERVAL:
        row.last_seen_at = now
        row.expires_at = now + SESSION_TTL
        await session.commit()
    return row.user, row


async def revoke_session(session: AsyncSession, token: str) -> None:
    row = await session.scalar(select(Session).where(Session.token_hash == _token_hash(token)))
    if row is not None:
        await session.delete(row)
        await session.commit()


async def revoke_other_sessions(session: AsyncSession, user: User, current: Session) -> int:
    rows = (
        await session.scalars(
            select(Session).where(Session.user_id == user.id, Session.id != current.id)
        )
    ).all()
    for row in rows:
        await session.delete(row)
    await session.commit()
    return len(rows)


async def list_sessions(session: AsyncSession, user: User) -> Sequence[Session]:
    return (
        await session.scalars(
            select(Session).where(Session.user_id == user.id).order_by(Session.last_seen_at.desc())
        )
    ).all()


# ── profile ──────────────────────────────────────────────────────────────────


async def update_profile(session: AsyncSession, user: User, data: ProfileUpdate) -> User:
    for key, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return user


async def change_password(session: AsyncSession, user: User, data: PasswordChange) -> None:
    if not verify_password(data.current_password, user.password_hash):
        raise ForbiddenError("Current password is incorrect")
    if data.current_password == data.new_password:
        raise ValidationError("New password must differ from the current one")
    require_acceptable_password(data.new_password, email=user.email, display_name=user.display_name)
    user.password_hash = hash_password(data.new_password)
    await session.commit()

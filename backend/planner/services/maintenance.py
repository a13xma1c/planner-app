"""Housekeeping: purge expired sessions and stale invitations."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import Invitation, Session, utcnow

INVITATION_RETENTION = timedelta(days=30)


async def purge_expired(session: AsyncSession) -> dict[str, int]:
    """Delete expired sessions and invitations that expired/were revoked a while ago."""
    now = utcnow()
    sessions = await session.execute(delete(Session).where(Session.expires_at <= now))
    cutoff = now - INVITATION_RETENTION
    invitations = await session.execute(
        delete(Invitation).where(
            or_(Invitation.expires_at <= cutoff, Invitation.revoked_at <= cutoff)
        )
    )
    await session.commit()
    return {
        "sessions": int(getattr(sessions, "rowcount", 0) or 0),
        "invitations": int(getattr(invitations, "rowcount", 0) or 0),
    }

"""Task comments."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import Comment, Membership, Role, Task, User, utcnow
from planner.schemas import CommentCreate
from planner.services.errors import ForbiddenError, NotFoundError


async def list_comments(session: AsyncSession, task: Task) -> Sequence[Comment]:
    return (
        await session.scalars(
            select(Comment)
            .where(Comment.task_id == task.id)
            .order_by(Comment.created_at, Comment.id)
        )
    ).all()


async def add_comment(
    session: AsyncSession, task: Task, author: User, data: CommentCreate
) -> Comment:
    now = utcnow()
    comment = Comment(
        task_id=task.id, author_id=author.id, body=data.body, created_at=now, updated_at=now
    )
    session.add(comment)
    task.updated_at = now
    await session.commit()
    await session.refresh(comment)
    return comment


async def _get_comment(session: AsyncSession, task: Task, comment_id: int) -> Comment:
    comment = await session.get(Comment, comment_id)
    if comment is None or comment.task_id != task.id:
        raise NotFoundError(f"Comment {comment_id} not found")
    return comment


async def update_comment(
    session: AsyncSession, task: Task, comment_id: int, actor: User, data: CommentCreate
) -> Comment:
    comment = await _get_comment(session, task, comment_id)
    if comment.author_id != actor.id:
        raise ForbiddenError("Only the author can edit a comment")
    comment.body = data.body
    await session.commit()
    await session.refresh(comment)
    return comment


async def delete_comment(
    session: AsyncSession, task: Task, comment_id: int, actor: Membership
) -> None:
    comment = await _get_comment(session, task, comment_id)
    if comment.author_id != actor.user_id and actor.role != Role.OWNER:
        raise ForbiddenError("Only the author or a planner owner can delete a comment")
    await session.delete(comment)
    await session.commit()

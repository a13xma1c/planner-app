"""Task comments."""

from __future__ import annotations

from fastapi import APIRouter, status

from planner.api.deps import EditorCtx, Notify, SessionDep, ViewerCtx
from planner.schemas import CommentCreate, CommentRead
from planner.services import comments as svc
from planner.services.tasks import get_task

router = APIRouter(prefix="/tasks/{task_id}/comments", tags=["comments"])


@router.get("", response_model=list[CommentRead])
async def list_comments(session: SessionDep, ctx: ViewerCtx, task_id: int) -> list[CommentRead]:
    task = await get_task(session, ctx.id, task_id)
    return [CommentRead.model_validate(c) for c in await svc.list_comments(session, task)]


@router.post("", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def add_comment(
    session: SessionDep, ctx: EditorCtx, notify: Notify, task_id: int, payload: CommentCreate
) -> CommentRead:
    task = await get_task(session, ctx.id, task_id)
    comment = await svc.add_comment(session, task, ctx.user, payload)
    notify("comments", task_id=task_id)
    return CommentRead.model_validate(comment)


@router.patch("/{comment_id}", response_model=CommentRead)
async def update_comment(
    session: SessionDep,
    ctx: EditorCtx,
    notify: Notify,
    task_id: int,
    comment_id: int,
    payload: CommentCreate,
) -> CommentRead:
    task = await get_task(session, ctx.id, task_id)
    comment = await svc.update_comment(session, task, comment_id, ctx.user, payload)
    notify("comments", task_id=task_id)
    return CommentRead.model_validate(comment)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    session: SessionDep, ctx: EditorCtx, notify: Notify, task_id: int, comment_id: int
) -> None:
    task = await get_task(session, ctx.id, task_id)
    await svc.delete_comment(session, task, comment_id, ctx.membership)
    notify("comments", task_id=task_id)

"""Tag endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from planner.api.deps import EditorCtx, Notify, SessionDep, ViewerCtx
from planner.schemas import TagCreate, TagRead, TagUpdate, TagWithCount
from planner.services import tags as svc

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagWithCount])
async def list_tags(session: SessionDep, ctx: ViewerCtx) -> list[TagWithCount]:
    return [
        TagWithCount(**TagRead.model_validate(t).model_dump(), task_count=n)
        for t, n in await svc.list_tags_with_counts(session, ctx.id)
    ]


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(
    session: SessionDep, ctx: EditorCtx, notify: Notify, payload: TagCreate
) -> TagRead:
    tag = await svc.create_tag(session, ctx.id, payload)
    notify("tags")
    return TagRead.model_validate(tag)


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(
    session: SessionDep, ctx: EditorCtx, notify: Notify, tag_id: int, payload: TagUpdate
) -> TagRead:
    tag = await svc.update_tag(session, ctx.id, tag_id, payload)
    notify("tags")
    return TagRead.model_validate(tag)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(session: SessionDep, ctx: EditorCtx, notify: Notify, tag_id: int) -> None:
    await svc.delete_tag(session, ctx.id, tag_id)
    notify("tags")

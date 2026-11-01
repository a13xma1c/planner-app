"""Tag endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from planner.api.deps import SessionDep
from planner.schemas import TagCreate, TagRead, TagUpdate, TagWithCount
from planner.services import tags as svc

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagWithCount])
async def list_tags(session: SessionDep) -> list[TagWithCount]:
    return [
        TagWithCount(**TagRead.model_validate(t).model_dump(), task_count=n)
        for t, n in await svc.list_tags_with_counts(session)
    ]


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(session: SessionDep, payload: TagCreate) -> TagRead:
    return TagRead.model_validate(await svc.create_tag(session, payload))


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(session: SessionDep, tag_id: int, payload: TagUpdate) -> TagRead:
    return TagRead.model_validate(await svc.update_tag(session, tag_id, payload))


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(session: SessionDep, tag_id: int) -> None:
    await svc.delete_tag(session, tag_id)

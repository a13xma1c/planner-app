"""Tag CRUD and lookup helpers."""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import Tag, task_tags
from planner.schemas import TagCreate, TagUpdate, normalise_tag_name
from planner.services.errors import ConflictError, NotFoundError


async def list_tags(session: AsyncSession) -> Sequence[Tag]:
    result = await session.scalars(select(Tag).order_by(Tag.name))
    return result.all()


async def list_tags_with_counts(session: AsyncSession) -> list[tuple[Tag, int]]:
    stmt = (
        select(Tag, func.count(task_tags.c.task_id))
        .outerjoin(task_tags, task_tags.c.tag_id == Tag.id)
        .group_by(Tag.id)
        .order_by(Tag.name)
    )
    rows = (await session.execute(stmt)).all()
    return [(tag, int(count)) for tag, count in rows]


async def get_tag(session: AsyncSession, tag_id: int) -> Tag:
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(f"Tag {tag_id} not found")
    return tag


async def create_tag(session: AsyncSession, data: TagCreate) -> Tag:
    existing = await session.scalar(select(Tag).where(Tag.name == data.name))
    if existing is not None:
        raise ConflictError(f"Tag '{data.name}' already exists")
    tag = Tag(name=data.name, color=data.color)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


async def update_tag(session: AsyncSession, tag_id: int, data: TagUpdate) -> Tag:
    tag = await get_tag(session, tag_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "name" in changes and changes["name"] != tag.name:
        clash = await session.scalar(select(Tag).where(Tag.name == changes["name"]))
        if clash is not None:
            raise ConflictError(f"Tag '{changes['name']}' already exists")
    for key, value in changes.items():
        setattr(tag, key, value)
    await session.commit()
    await session.refresh(tag)
    return tag


async def delete_tag(session: AsyncSession, tag_id: int) -> None:
    tag = await get_tag(session, tag_id)
    await session.delete(tag)
    await session.commit()


async def get_or_create_tags(session: AsyncSession, names: Iterable[str]) -> list[Tag]:
    """Resolve tag names to Tag rows, creating any that don't exist yet (order preserved)."""
    wanted: list[str] = []
    for raw in names:
        name = normalise_tag_name(raw)
        if name not in wanted:
            wanted.append(name)
    if not wanted:
        return []
    existing = {
        t.name: t for t in (await session.scalars(select(Tag).where(Tag.name.in_(wanted)))).all()
    }
    tags: list[Tag] = []
    for name in wanted:
        tag = existing.get(name)
        if tag is None:
            tag = Tag(name=name)
            session.add(tag)
            existing[name] = tag
        tags.append(tag)
    await session.flush()
    return tags

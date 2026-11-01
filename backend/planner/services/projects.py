"""Project CRUD."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import Project, Status, Task
from planner.schemas import ProjectCreate, ProjectUpdate
from planner.services.errors import ConflictError, NotFoundError


async def list_projects(
    session: AsyncSession, workspace_id: int, *, include_archived: bool = True
) -> Sequence[Project]:
    stmt = select(Project).where(Project.workspace_id == workspace_id).order_by(Project.name)
    if not include_archived:
        stmt = stmt.where(Project.is_archived.is_(False))
    return (await session.scalars(stmt)).all()


async def list_projects_with_stats(
    session: AsyncSession, workspace_id: int, *, include_archived: bool = True
) -> list[tuple[Project, int, int, int]]:
    """Return ``(project, task_count, done_count, overdue_count)`` tuples."""
    today = date.today()
    done = case((Task.status == Status.DONE, 1), else_=0)
    overdue = case(
        ((Task.status != Status.DONE) & (Task.due_date < today), 1),
        else_=0,
    )
    stmt = (
        select(
            Project,
            func.count(Task.id),
            func.coalesce(func.sum(done), 0),
            func.coalesce(func.sum(overdue), 0),
        )
        .outerjoin(Task, Task.project_id == Project.id)
        .where(Project.workspace_id == workspace_id)
        .group_by(Project.id)
        .order_by(Project.name)
    )
    if not include_archived:
        stmt = stmt.where(Project.is_archived.is_(False))
    rows = (await session.execute(stmt)).all()
    return [(p, int(total), int(d), int(o)) for p, total, d, o in rows]


async def get_project(session: AsyncSession, workspace_id: int, project_id: int) -> Project:
    project = await session.get(Project, project_id)
    if project is None or project.workspace_id != workspace_id:
        raise NotFoundError(f"Project {project_id} not found")
    return project


async def find_project_by_name(
    session: AsyncSession, workspace_id: int, name: str
) -> Project | None:
    stmt = select(Project).where(
        Project.workspace_id == workspace_id,
        func.lower(Project.name) == name.strip().lower(),
    )
    return await session.scalar(stmt)


async def create_project(session: AsyncSession, workspace_id: int, data: ProjectCreate) -> Project:
    if await find_project_by_name(session, workspace_id, data.name) is not None:
        raise ConflictError(f"Project '{data.name}' already exists")
    project = Project(workspace_id=workspace_id, **data.model_dump())
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


async def update_project(
    session: AsyncSession, workspace_id: int, project_id: int, data: ProjectUpdate
) -> Project:
    project = await get_project(session, workspace_id, project_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    new_name = changes.get("name")
    if new_name and new_name.lower() != project.name.lower():
        clash = await find_project_by_name(session, workspace_id, new_name)
        if clash is not None:
            raise ConflictError(f"Project '{new_name}' already exists")
    for key, value in changes.items():
        setattr(project, key, value)
    await session.commit()
    await session.refresh(project)
    return project


async def delete_project(session: AsyncSession, workspace_id: int, project_id: int) -> None:
    """Delete a project. Its tasks are kept and moved to the Inbox (``project_id = NULL``)."""
    project = await get_project(session, workspace_id, project_id)
    await session.delete(project)
    await session.commit()

"""Project endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from planner.api.deps import SessionDep
from planner.schemas import ProjectCreate, ProjectRead, ProjectUpdate, ProjectWithStats
from planner.services import projects as svc

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectWithStats])
async def list_projects(
    session: SessionDep, include_archived: bool = True
) -> list[ProjectWithStats]:
    rows = await svc.list_projects_with_stats(session, include_archived=include_archived)
    return [
        ProjectWithStats(
            **ProjectRead.model_validate(p).model_dump(),
            task_count=total,
            done_count=done,
            overdue_count=overdue,
        )
        for p, total, done, overdue in rows
    ]


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(session: SessionDep, payload: ProjectCreate) -> ProjectRead:
    return ProjectRead.model_validate(await svc.create_project(session, payload))


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(session: SessionDep, project_id: int) -> ProjectRead:
    return ProjectRead.model_validate(await svc.get_project(session, project_id))


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    session: SessionDep, project_id: int, payload: ProjectUpdate
) -> ProjectRead:
    return ProjectRead.model_validate(await svc.update_project(session, project_id, payload))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(session: SessionDep, project_id: int) -> None:
    await svc.delete_project(session, project_id)

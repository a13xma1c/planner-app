"""Subtask (checklist item) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from planner.api.deps import SessionDep
from planner.schemas import SubtaskCreate, SubtaskRead, SubtaskUpdate
from planner.services import tasks as svc

router = APIRouter(tags=["subtasks"])


@router.post(
    "/tasks/{task_id}/subtasks", response_model=SubtaskRead, status_code=status.HTTP_201_CREATED
)
async def add_subtask(session: SessionDep, task_id: int, payload: SubtaskCreate) -> SubtaskRead:
    return SubtaskRead.model_validate(await svc.add_subtask(session, task_id, payload))


@router.patch("/subtasks/{subtask_id}", response_model=SubtaskRead)
async def update_subtask(
    session: SessionDep, subtask_id: int, payload: SubtaskUpdate
) -> SubtaskRead:
    return SubtaskRead.model_validate(await svc.update_subtask(session, subtask_id, payload))


@router.delete("/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(session: SessionDep, subtask_id: int) -> None:
    await svc.delete_subtask(session, subtask_id)

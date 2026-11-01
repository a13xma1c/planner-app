"""Subtask (checklist item) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from planner.api.deps import EditorCtx, Notify, SessionDep
from planner.schemas import SubtaskCreate, SubtaskRead, SubtaskUpdate
from planner.services import tasks as svc

router = APIRouter(tags=["subtasks"])


@router.post(
    "/tasks/{task_id}/subtasks", response_model=SubtaskRead, status_code=status.HTTP_201_CREATED
)
async def add_subtask(
    session: SessionDep, ctx: EditorCtx, notify: Notify, task_id: int, payload: SubtaskCreate
) -> SubtaskRead:
    sub = await svc.add_subtask(session, ctx.id, task_id, payload)
    notify("tasks", task_id=task_id)
    return SubtaskRead.model_validate(sub)


@router.patch("/subtasks/{subtask_id}", response_model=SubtaskRead)
async def update_subtask(
    session: SessionDep, ctx: EditorCtx, notify: Notify, subtask_id: int, payload: SubtaskUpdate
) -> SubtaskRead:
    sub = await svc.update_subtask(session, ctx.id, subtask_id, payload)
    notify("tasks", task_id=sub.task_id)
    return SubtaskRead.model_validate(sub)


@router.delete("/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    session: SessionDep, ctx: EditorCtx, notify: Notify, subtask_id: int
) -> None:
    await svc.delete_subtask(session, ctx.id, subtask_id)
    notify("tasks")

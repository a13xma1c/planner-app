"""Task endpoints (scoped to the workspace selected by ``X-Workspace-Id``)."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from planner.api.deps import EditorCtx, Notify, SessionDep, ViewerCtx
from planner.models import Priority, Status
from planner.schemas import (
    BulkRequest,
    BulkResult,
    CompleteResult,
    QuickAddRequest,
    QuickAddResult,
    ReorderRequest,
    TaskCreate,
    TaskFilter,
    TaskRead,
    TaskSort,
    TaskUpdate,
)
from planner.services import tasks as svc

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    session: SessionDep,
    ctx: ViewerCtx,
    project_id: int | None = None,
    inbox: bool = False,
    status_: Annotated[list[Status] | None, Query(alias="status")] = None,
    priority: Annotated[list[Priority] | None, Query()] = None,
    tag: Annotated[list[str] | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    due_from: date | None = None,
    due_to: date | None = None,
    overdue: bool = False,
    assignee_id: int | None = None,
    assigned_to_me: bool = False,
    unassigned: bool = False,
    include_done: bool = True,
    sort: TaskSort = TaskSort.SMART,
    order: Literal["asc", "desc"] = "asc",
    limit: Annotated[int | None, Query(ge=1, le=1000)] = None,
) -> list[TaskRead]:
    f = TaskFilter(
        project_id=project_id,
        inbox=inbox,
        status=status_,
        priority=priority,
        tag=tag,
        search=search,
        due_from=due_from,
        due_to=due_to,
        overdue=overdue,
        assignee_id=ctx.user.id if assigned_to_me else assignee_id,
        unassigned=unassigned,
        include_done=include_done,
        sort=sort,
        order=order,
        limit=limit,
    )
    return [TaskRead.model_validate(t) for t in await svc.list_tasks(session, ctx.id, f)]


@router.get("/upcoming", response_model=list[TaskRead])
async def upcoming(
    session: SessionDep, ctx: ViewerCtx, days: Annotated[int, Query(ge=1, le=365)] = 7
) -> list[TaskRead]:
    return [TaskRead.model_validate(t) for t in await svc.upcoming(session, ctx.id, days)]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    session: SessionDep, ctx: EditorCtx, notify: Notify, payload: TaskCreate
) -> TaskRead:
    task = await svc.create_task(session, ctx.id, payload, created_by_id=ctx.user.id)
    notify("tasks")
    return TaskRead.model_validate(task)


@router.post("/quick-add", response_model=QuickAddResult, status_code=status.HTTP_201_CREATED)
async def quick_add(
    session: SessionDep, ctx: EditorCtx, notify: Notify, payload: QuickAddRequest
) -> QuickAddResult:
    preview, task = await svc.quick_add(
        session, ctx.id, payload.text, dry_run=payload.dry_run, created_by_id=ctx.user.id
    )
    if task is not None:
        notify("tasks")
    return QuickAddResult(preview=preview, task=TaskRead.model_validate(task) if task else None)


@router.post("/bulk", response_model=BulkResult)
async def bulk(
    session: SessionDep, ctx: EditorCtx, notify: Notify, payload: BulkRequest
) -> BulkResult:
    affected, tasks = await svc.bulk_update(session, ctx.id, payload)
    if affected:
        notify("tasks")
    return BulkResult(affected=affected, tasks=[TaskRead.model_validate(t) for t in tasks])


@router.post("/reorder", response_model=list[TaskRead])
async def reorder(
    session: SessionDep, ctx: EditorCtx, notify: Notify, payload: ReorderRequest
) -> list[TaskRead]:
    tasks = await svc.reorder_tasks(session, ctx.id, payload.status, payload.ordered_ids)
    notify("tasks")
    return [TaskRead.model_validate(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(session: SessionDep, ctx: ViewerCtx, task_id: int) -> TaskRead:
    return TaskRead.model_validate(await svc.get_task(session, ctx.id, task_id))


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    session: SessionDep, ctx: EditorCtx, notify: Notify, task_id: int, payload: TaskUpdate
) -> TaskRead:
    task = await svc.update_task(session, ctx.id, task_id, payload)
    notify("tasks", task_id=task_id)
    return TaskRead.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(session: SessionDep, ctx: EditorCtx, notify: Notify, task_id: int) -> None:
    await svc.delete_task(session, ctx.id, task_id)
    notify("tasks", task_id=task_id)


@router.post("/{task_id}/complete", response_model=CompleteResult)
async def complete_task(
    session: SessionDep, ctx: EditorCtx, notify: Notify, task_id: int
) -> CompleteResult:
    task, nxt = await svc.complete_task(session, ctx.id, task_id)
    notify("tasks", task_id=task_id)
    return CompleteResult(
        task=TaskRead.model_validate(task),
        next_task=TaskRead.model_validate(nxt) if nxt else None,
    )


@router.post("/{task_id}/reopen", response_model=TaskRead)
async def reopen_task(
    session: SessionDep, ctx: EditorCtx, notify: Notify, task_id: int
) -> TaskRead:
    task = await svc.reopen_task(session, ctx.id, task_id)
    notify("tasks", task_id=task_id)
    return TaskRead.model_validate(task)

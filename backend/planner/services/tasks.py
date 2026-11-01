"""Task use-cases: CRUD, filtering, completion with recurrence, bulk ops, quick-add."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

from sqlalchemy import Select, asc, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import Case

from planner.models import (
    PRIORITY_RANK,
    Membership,
    Project,
    Status,
    Subtask,
    Tag,
    Task,
    task_tags,
    utcnow,
)
from planner.schemas import (
    BulkAction,
    BulkRequest,
    QuickAddPreview,
    SubtaskCreate,
    SubtaskUpdate,
    TaskCreate,
    TaskFilter,
    TaskSort,
    TaskUpdate,
)
from planner.services import quick_add as qa
from planner.services.errors import NotFoundError, ValidationError
from planner.services.projects import find_project_by_name, get_project
from planner.services.recurrence import next_due_date
from planner.services.tags import get_or_create_tags

# ── queries ──────────────────────────────────────────────────────────────────


def _priority_rank_expr() -> Case[int]:
    return case(
        {p.value: rank for p, rank in PRIORITY_RANK.items()},
        value=Task.priority,
        else_=99,
    )


def _apply_filters(stmt: Select[Any], f: TaskFilter, today: date) -> Select[Any]:
    if f.inbox:
        stmt = stmt.where(Task.project_id.is_(None))
    elif f.project_id is not None:
        stmt = stmt.where(Task.project_id == f.project_id)
    if f.status:
        stmt = stmt.where(Task.status.in_(f.status))
    elif not f.include_done:
        stmt = stmt.where(Task.status != Status.DONE)
    if f.priority:
        stmt = stmt.where(Task.priority.in_(f.priority))
    if f.tag:
        wanted = [t.lstrip("#").lower() for t in f.tag]
        for name in wanted:  # AND semantics: task must carry every requested tag
            sub = select(task_tags.c.task_id).join(Tag, Tag.id == task_tags.c.tag_id)
            stmt = stmt.where(Task.id.in_(sub.where(Tag.name == name)))
    if f.search:
        pattern = f"%{f.search.strip()}%"
        stmt = stmt.where(or_(Task.title.ilike(pattern), Task.notes.ilike(pattern)))
    if f.due_from is not None:
        stmt = stmt.where(Task.due_date >= f.due_from)
    if f.due_to is not None:
        stmt = stmt.where(Task.due_date <= f.due_to)
    if f.overdue:
        stmt = stmt.where(Task.status != Status.DONE, Task.due_date < today)
    if f.unassigned:
        stmt = stmt.where(Task.assignee_id.is_(None))
    elif f.assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == f.assignee_id)
    return stmt


def _apply_sort(stmt: Select[Any], f: TaskFilter, today: date) -> Select[Any]:
    direction = desc if f.order == "desc" else asc

    match f.sort:
        case TaskSort.SMART:
            # open before done, overdue first, then by priority, then nearest due date
            is_done = case((Task.status == Status.DONE, 1), else_=0)
            is_overdue = case(((Task.status != Status.DONE) & (Task.due_date < today), 0), else_=1)
            due = func.coalesce(Task.due_date, date(9999, 12, 31))
            return stmt.order_by(is_done, is_overdue, _priority_rank_expr(), due, Task.id)
        case TaskSort.DUE_DATE:
            due = func.coalesce(Task.due_date, date(9999, 12, 31))
            return stmt.order_by(direction(due), Task.id)
        case TaskSort.PRIORITY:
            return stmt.order_by(direction(_priority_rank_expr()), Task.id)
        case TaskSort.CREATED:
            return stmt.order_by(direction(Task.created_at), Task.id)
        case TaskSort.UPDATED:
            return stmt.order_by(direction(Task.updated_at), Task.id)
        case TaskSort.TITLE:
            return stmt.order_by(direction(func.lower(Task.title)), Task.id)
        case TaskSort.POSITION:
            return stmt.order_by(direction(Task.position), Task.id)


async def list_tasks(
    session: AsyncSession,
    workspace_id: int,
    f: TaskFilter | None = None,
    *,
    today: date | None = None,
) -> Sequence[Task]:
    f = f or TaskFilter()
    today = today or date.today()
    base = select(Task).where(Task.workspace_id == workspace_id)
    stmt: Select[Any] = _apply_sort(_apply_filters(base, f, today), f, today)
    if f.limit:
        stmt = stmt.limit(f.limit)
    return (await session.scalars(stmt)).all()


async def get_task(session: AsyncSession, workspace_id: int, task_id: int) -> Task:
    task = await session.get(Task, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise NotFoundError(f"Task {task_id} not found")
    return task


async def _validate_project(
    session: AsyncSession, workspace_id: int, project_id: int | None
) -> None:
    if project_id is not None:
        await get_project(session, workspace_id, project_id)  # raises NotFoundError


async def _validate_assignee(
    session: AsyncSession, workspace_id: int, assignee_id: int | None
) -> None:
    if assignee_id is None:
        return
    member = await session.scalar(
        select(Membership).where(
            Membership.workspace_id == workspace_id, Membership.user_id == assignee_id
        )
    )
    if member is None:
        raise ValidationError("Assignee must be a member of this planner")


async def _next_position(session: AsyncSession, workspace_id: int, status: Status) -> int:
    current = await session.scalar(
        select(func.max(Task.position)).where(
            Task.workspace_id == workspace_id, Task.status == status
        )
    )
    return (current or 0) + 1


# ── create / update / delete ─────────────────────────────────────────────────


async def create_task(
    session: AsyncSession,
    workspace_id: int,
    data: TaskCreate,
    *,
    created_by_id: int | None = None,
) -> Task:
    await _validate_project(session, workspace_id, data.project_id)
    await _validate_assignee(session, workspace_id, data.assignee_id)
    task = Task(
        **data.model_dump(exclude={"tags", "subtasks"}),
        workspace_id=workspace_id,
        created_by_id=created_by_id,
        position=await _next_position(session, workspace_id, data.status),
    )
    if data.status == Status.DONE:
        task.completed_at = utcnow()
    task.tags = await get_or_create_tags(session, workspace_id, data.tags)
    task.subtasks = [Subtask(title=t.strip(), position=i) for i, t in enumerate(data.subtasks)]
    session.add(task)
    await session.commit()
    return await _reload(session, task.id)


async def update_task(
    session: AsyncSession, workspace_id: int, task_id: int, data: TaskUpdate
) -> Task:
    task = await get_task(session, workspace_id, task_id)
    changes = data.model_dump(exclude_unset=True)
    tags = changes.pop("tags", None)
    if "project_id" in changes:
        await _validate_project(session, workspace_id, changes["project_id"])
    if "assignee_id" in changes:
        await _validate_assignee(session, workspace_id, changes["assignee_id"])
    if "status" in changes and changes["status"] != task.status:
        _apply_status_change(task, changes["status"])
        if "position" not in changes:
            changes["position"] = await _next_position(session, workspace_id, changes["status"])
    for key, value in changes.items():
        if key == "title" and value is None:
            continue
        setattr(task, key, value)
    if tags is not None:
        task.tags = await get_or_create_tags(session, workspace_id, tags)
    await session.commit()
    return await _reload(session, task.id)


def _apply_status_change(task: Task, status: Status) -> None:
    task.status = status
    task.completed_at = utcnow() if status == Status.DONE else None


async def delete_task(session: AsyncSession, workspace_id: int, task_id: int) -> None:
    task = await get_task(session, workspace_id, task_id)
    await session.delete(task)
    await session.commit()


async def _reload(session: AsyncSession, task_id: int) -> Task:
    """Re-fetch a task (and its eager relationships) from the database."""
    task = await session.get(Task, task_id, populate_existing=True)
    if task is None:  # pragma: no cover - defensive
        raise NotFoundError(f"Task {task_id} not found")
    return task


# ── completion & recurrence ──────────────────────────────────────────────────


async def complete_task(
    session: AsyncSession, workspace_id: int, task_id: int, *, today: date | None = None
) -> tuple[Task, Task | None]:
    """Mark a task done. For recurring tasks, spawn the next occurrence."""
    today = today or date.today()
    task = await get_task(session, workspace_id, task_id)
    if task.status == Status.DONE:
        return task, None

    _apply_status_change(task, Status.DONE)
    task.position = await _next_position(session, workspace_id, Status.DONE)

    follow_up: Task | None = None
    if task.recurrence is not None:
        base = task.due_date or today
        follow_up = Task(
            workspace_id=task.workspace_id,
            title=task.title,
            notes=task.notes,
            project_id=task.project_id,
            assignee_id=task.assignee_id,
            created_by_id=task.created_by_id,
            priority=task.priority,
            status=Status.TODO,
            due_date=next_due_date(base, task.recurrence, after=today),
            recurrence=task.recurrence,
            estimate_minutes=task.estimate_minutes,
            position=await _next_position(session, workspace_id, Status.TODO),
        )
        follow_up.tags = list(task.tags)
        follow_up.subtasks = [Subtask(title=s.title, position=s.position) for s in task.subtasks]
        task.recurrence = None  # the chain continues on the follow-up, not the done task
        session.add(follow_up)

    await session.commit()
    done_id, next_id = task.id, (follow_up.id if follow_up else None)
    done = await _reload(session, done_id)
    nxt = await _reload(session, next_id) if next_id is not None else None
    return done, nxt


async def reopen_task(session: AsyncSession, workspace_id: int, task_id: int) -> Task:
    task = await get_task(session, workspace_id, task_id)
    if task.status == Status.DONE:
        _apply_status_change(task, Status.TODO)
        task.position = await _next_position(session, workspace_id, Status.TODO)
        await session.commit()
    return await _reload(session, task.id)


# ── board ordering ───────────────────────────────────────────────────────────


async def reorder_tasks(
    session: AsyncSession, workspace_id: int, status: Status, ordered_ids: list[int]
) -> list[Task]:
    """Move the given tasks into ``status`` and set their positions to the given order."""
    if len(set(ordered_ids)) != len(ordered_ids):
        raise ValidationError("ordered_ids contains duplicates")
    rows = (
        await session.scalars(
            select(Task).where(Task.workspace_id == workspace_id, Task.id.in_(ordered_ids))
        )
    ).all()
    by_id = {t.id: t for t in rows}
    missing = [i for i in ordered_ids if i not in by_id]
    if missing:
        raise NotFoundError(f"Tasks not found: {missing}")
    for pos, task_id in enumerate(ordered_ids):
        task = by_id[task_id]
        if task.status != status:
            _apply_status_change(task, status)
        task.position = pos
    await session.commit()
    return [await _reload(session, i) for i in ordered_ids]


# ── bulk operations ──────────────────────────────────────────────────────────


async def bulk_update(
    session: AsyncSession, workspace_id: int, req: BulkRequest
) -> tuple[int, list[Task]]:
    rows = (
        await session.scalars(
            select(Task).where(Task.workspace_id == workspace_id, Task.id.in_(req.ids))
        )
    ).all()
    if not rows:
        return 0, []

    if req.action == BulkAction.DELETE:
        for t in rows:
            await session.delete(t)
        await session.commit()
        return len(rows), []

    if req.action == BulkAction.MOVE_TO_PROJECT:
        await _validate_project(session, workspace_id, req.project_id)
    if req.action == BulkAction.ASSIGN:
        await _validate_assignee(session, workspace_id, req.assignee_id)
    tag = (await get_or_create_tags(session, workspace_id, [req.tag]))[0] if req.tag else None

    for t in rows:
        match req.action:
            case BulkAction.COMPLETE:
                if t.status != Status.DONE:
                    _apply_status_change(t, Status.DONE)
            case BulkAction.REOPEN:
                if t.status == Status.DONE:
                    _apply_status_change(t, Status.TODO)
            case BulkAction.SET_STATUS:
                assert req.status is not None
                if t.status != req.status:
                    _apply_status_change(t, req.status)
            case BulkAction.SET_PRIORITY:
                assert req.priority is not None
                t.priority = req.priority
            case BulkAction.MOVE_TO_PROJECT:
                t.project_id = req.project_id
            case BulkAction.SET_DUE_DATE:
                t.due_date = req.due_date
            case BulkAction.ADD_TAG:
                assert tag is not None
                if tag not in t.tags:
                    t.tags.append(tag)
            case BulkAction.ASSIGN:
                t.assignee_id = req.assignee_id
    await session.commit()
    ids = [t.id for t in rows]
    return len(rows), [await _reload(session, i) for i in ids]


# ── subtasks ─────────────────────────────────────────────────────────────────


async def add_subtask(
    session: AsyncSession, workspace_id: int, task_id: int, data: SubtaskCreate
) -> Subtask:
    task = await get_task(session, workspace_id, task_id)
    position = max((s.position for s in task.subtasks), default=-1) + 1
    sub = Subtask(task_id=task.id, title=data.title, position=position)
    session.add(sub)
    task.updated_at = utcnow()
    await session.commit()
    await session.refresh(sub)
    return sub


async def _get_subtask(session: AsyncSession, workspace_id: int, subtask_id: int) -> Subtask:
    sub = await session.get(Subtask, subtask_id)
    if sub is None:
        raise NotFoundError(f"Subtask {subtask_id} not found")
    await get_task(session, workspace_id, sub.task_id)  # enforces workspace scope
    return sub


async def update_subtask(
    session: AsyncSession, workspace_id: int, subtask_id: int, data: SubtaskUpdate
) -> Subtask:
    sub = await _get_subtask(session, workspace_id, subtask_id)
    for key, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(sub, key, value)
    parent = await get_task(session, workspace_id, sub.task_id)
    parent.updated_at = utcnow()
    await session.commit()
    await session.refresh(sub)
    return sub


async def delete_subtask(session: AsyncSession, workspace_id: int, subtask_id: int) -> None:
    sub = await _get_subtask(session, workspace_id, subtask_id)
    parent = await get_task(session, workspace_id, sub.task_id)
    parent.updated_at = utcnow()
    await session.delete(sub)
    await session.commit()


# ── quick add ────────────────────────────────────────────────────────────────


async def quick_add(
    session: AsyncSession,
    workspace_id: int,
    text: str,
    *,
    dry_run: bool = False,
    today: date | None = None,
    created_by_id: int | None = None,
) -> tuple[QuickAddPreview, Task | None]:
    parsed = qa.parse(text, today=today)
    preview = QuickAddPreview(
        title=parsed.title,
        project_name=parsed.project_name,
        priority=parsed.priority,
        due_date=parsed.due_date,
        recurrence=parsed.recurrence,
        tags=parsed.tags,
        estimate_minutes=parsed.estimate_minutes,
        warnings=list(parsed.warnings),
    )
    if parsed.project_name:
        project: Project | None = await find_project_by_name(
            session, workspace_id, parsed.project_name
        )
        if project is None:
            preview.warnings.append(
                f"Project '{parsed.project_name}' not found; task will go to the Inbox."
            )
            preview.project_name = None
        else:
            preview.project_id = project.id
            preview.project_name = project.name
    if dry_run:
        return preview, None
    task = await create_task(
        session,
        workspace_id,
        TaskCreate(
            title=preview.title,
            project_id=preview.project_id,
            priority=preview.priority,
            due_date=preview.due_date,
            recurrence=preview.recurrence,
            estimate_minutes=preview.estimate_minutes,
            tags=preview.tags,
        ),
        created_by_id=created_by_id,
    )
    return preview, task


# ── convenience views ────────────────────────────────────────────────────────


async def upcoming(
    session: AsyncSession, workspace_id: int, days: int = 7, *, today: date | None = None
) -> Sequence[Task]:
    today = today or date.today()
    f = TaskFilter(due_from=today, due_to=today + timedelta(days=days), include_done=False)
    return await list_tasks(session, workspace_id, f, today=today)

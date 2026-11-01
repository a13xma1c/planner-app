"""Export / import of the whole planner, plus migration from the legacy CLI JSON file."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import Priority, Project, Recurrence, Status, Subtask, Tag, Task, task_tags
from planner.schemas import (
    ExportBundle,
    ImportBundle,
    ImportResult,
    LegacyImportRequest,
    ProjectRead,
    TagRead,
    TaskRead,
)
from planner.services.errors import ValidationError
from planner.services.tags import get_or_create_tags


async def export_all(session: AsyncSession) -> ExportBundle:
    projects = (await session.scalars(select(Project).order_by(Project.id))).all()
    tags = (await session.scalars(select(Tag).order_by(Tag.id))).all()
    tasks = (await session.scalars(select(Task).order_by(Task.id))).unique().all()
    return ExportBundle(
        exported_at=datetime.now(UTC),
        projects=[ProjectRead.model_validate(p) for p in projects],
        tags=[TagRead.model_validate(t) for t in tags],
        tasks=[TaskRead.model_validate(t) for t in tasks],
    )


async def _clear_all(session: AsyncSession) -> None:
    await session.execute(delete(task_tags))
    await session.execute(delete(Subtask))
    await session.execute(delete(Task))
    await session.execute(delete(Tag))
    await session.execute(delete(Project))
    await session.flush()


def _parse_date(value: Any, warnings: list[str], label: str) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        warnings.append(f"{label}: ignored invalid date {value!r}")
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        dt = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo is None else dt.astimezone(UTC).replace(tzinfo=None)


def _enum_or(enum_cls: type[Any], value: Any, default: Any, warnings: list[str], label: str) -> Any:
    if value is None:
        return default
    try:
        return enum_cls(value)
    except ValueError:
        warnings.append(
            f"{label}: unknown {enum_cls.__name__.lower()} {value!r}, using {default!r}"
        )
        return default


async def import_bundle(
    session: AsyncSession, bundle: ImportBundle, *, replace: bool = False
) -> ImportResult:
    """Import a bundle previously produced by :func:`export_all`.

    Entities are matched by name (projects/tags); tasks are always appended. With
    ``replace=True`` the database is wiped first.
    """
    if bundle.version != 2:
        raise ValidationError(f"Unsupported bundle version {bundle.version}")
    warnings: list[str] = []
    if replace:
        await _clear_all(session)

    project_map: dict[int | None, int | None] = {None: None}
    new_projects = 0
    for raw in bundle.projects:
        name = str(raw.get("name", "")).strip()
        if not name:
            warnings.append("Skipped project without a name")
            continue
        existing = await session.scalar(select(Project).where(Project.name == name))
        if existing is None:
            existing = Project(
                name=name,
                description=str(raw.get("description") or ""),
                color=str(raw.get("color") or "#6366f1"),
                is_archived=bool(raw.get("is_archived", False)),
            )
            session.add(existing)
            await session.flush()
            new_projects += 1
        project_map[raw.get("id")] = existing.id

    new_tags = 0
    for raw in bundle.tags:
        name = str(raw.get("name", "")).strip().lstrip("#").lower()
        if not name:
            continue
        existing = await session.scalar(select(Tag).where(Tag.name == name))
        if existing is None:
            session.add(Tag(name=name, color=str(raw.get("color") or "#64748b")))
            new_tags += 1
    await session.flush()

    new_tasks = new_subtasks = skipped = 0
    for raw in bundle.tasks:
        title = str(raw.get("title", "")).strip()
        if not title:
            skipped += 1
            warnings.append("Skipped task without a title")
            continue
        label = f"Task '{title[:30]}'"
        status = _enum_or(Status, raw.get("status"), Status.TODO, warnings, label)
        task = Task(
            title=title[:200],
            notes=str(raw.get("notes") or ""),
            project_id=project_map.get(raw.get("project_id")),
            priority=_enum_or(Priority, raw.get("priority"), Priority.MEDIUM, warnings, label),
            status=status,
            due_date=_parse_date(raw.get("due_date"), warnings, label),
            recurrence=_enum_or(Recurrence, raw.get("recurrence"), None, warnings, label),
            estimate_minutes=raw.get("estimate_minutes"),
            position=int(raw.get("position") or 0),
            completed_at=_parse_datetime(raw.get("completed_at")),
        )
        created = _parse_datetime(raw.get("created_at"))
        if created is not None:
            task.created_at = created
        if status == Status.DONE and task.completed_at is None:
            task.completed_at = created or datetime.now(UTC).replace(tzinfo=None)
        tag_names = [t["name"] if isinstance(t, dict) else str(t) for t in raw.get("tags") or []]
        task.tags = await get_or_create_tags(session, tag_names)
        for i, sub in enumerate(raw.get("subtasks") or []):
            sub_title = (sub.get("title") if isinstance(sub, dict) else str(sub)) or ""
            if not str(sub_title).strip():
                continue
            task.subtasks.append(
                Subtask(
                    title=str(sub_title)[:200],
                    is_done=bool(sub.get("is_done", False)) if isinstance(sub, dict) else False,
                    position=int(sub.get("position", i)) if isinstance(sub, dict) else i,
                )
            )
            new_subtasks += 1
        session.add(task)
        new_tasks += 1

    await session.commit()
    return ImportResult(
        projects=new_projects,
        tags=new_tags,
        tasks=new_tasks,
        subtasks=new_subtasks,
        skipped=skipped,
        warnings=warnings,
    )


LEGACY_PRIORITY = {"low": Priority.LOW, "medium": Priority.MEDIUM, "high": Priority.HIGH}
LEGACY_STATUS = {"todo": Status.TODO, "in_progress": Status.IN_PROGRESS, "done": Status.DONE}


async def import_legacy(session: AsyncSession, payload: dict[str, Any]) -> ImportResult:
    """Import the ``planner_data.json`` format of the original CLI application.

    Legacy shape::

        {"tasks": [{"id", "title", "project", "priority", "status", "due_date", "notes"}],
         "projects": [{"name", "description"}], "next_id": N}

    The legacy "Inbox" project maps to the built-in Inbox (no project).
    """
    try:
        legacy = LegacyImportRequest.model_validate(payload)
    except PydanticValidationError as exc:
        raise ValidationError(f"Invalid legacy file: {exc.errors()[0]['msg']}") from exc

    warnings: list[str] = []
    projects_by_name: dict[str, int | None] = {"inbox": None}
    new_projects = 0
    for raw in legacy.projects:
        name = str(raw.get("name", "")).strip()
        if not name or name.lower() == "inbox":
            continue
        existing = await session.scalar(select(Project).where(Project.name == name))
        if existing is None:
            existing = Project(name=name, description=str(raw.get("description") or ""))
            session.add(existing)
            await session.flush()
            new_projects += 1
        projects_by_name[name.lower()] = existing.id

    new_tasks = skipped = 0
    for raw in legacy.tasks:
        title = str(raw.get("title", "")).strip()
        if not title:
            skipped += 1
            continue
        label = f"Task '{title[:30]}'"
        project_name = str(raw.get("project") or "Inbox").strip() or "Inbox"
        if project_name.lower() not in projects_by_name:
            project = await session.scalar(
                select(Project).where(func.lower(Project.name) == project_name.lower())
            )
            if project is None:
                project = Project(name=project_name)
                session.add(project)
                await session.flush()
                new_projects += 1
                warnings.append(f"Created missing project '{project_name}'")
            projects_by_name[project_name.lower()] = project.id
        status_raw = str(raw.get("status") or "todo")
        priority_raw = str(raw.get("priority") or "medium")
        if status_raw not in LEGACY_STATUS:
            warnings.append(f"{label}: unknown status {status_raw!r}, using 'todo'")
        if priority_raw not in LEGACY_PRIORITY:
            warnings.append(f"{label}: unknown priority {priority_raw!r}, using 'medium'")
        status = LEGACY_STATUS.get(status_raw, Status.TODO)
        task = Task(
            title=title[:200],
            notes=str(raw.get("notes") or ""),
            project_id=projects_by_name[project_name.lower()],
            priority=LEGACY_PRIORITY.get(priority_raw, Priority.MEDIUM),
            status=status,
            due_date=_parse_date(raw.get("due_date"), warnings, label),
        )
        if status == Status.DONE:
            task.completed_at = datetime.now(UTC).replace(tzinfo=None)
        session.add(task)
        new_tasks += 1

    await session.commit()
    return ImportResult(
        projects=new_projects,
        tags=0,
        tasks=new_tasks,
        subtasks=0,
        skipped=skipped,
        warnings=warnings,
    )

"""Dashboard statistics."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.models import Priority, Project, Status, Task
from planner.schemas import DayCount, Overview, ProjectProgress


async def overview(session: AsyncSession, *, today: date | None = None) -> Overview:
    today = today or date.today()
    tasks = (await session.scalars(select(Task))).all()

    by_status = dict.fromkeys(Status, 0)
    by_priority = dict.fromkeys(Priority, 0)
    overdue = due_today = due_week = 0
    week_end = today + timedelta(days=6)
    for t in tasks:
        by_status[t.status] += 1
        if t.status != Status.DONE:
            by_priority[t.priority] += 1
            if t.due_date is not None:
                if t.due_date < today:
                    overdue += 1
                elif t.due_date == today:
                    due_today += 1
                if today <= t.due_date <= week_end:
                    due_week += 1

    completed_days = [t.completed_at.date() for t in tasks if t.completed_at is not None]
    created_days = [t.created_at.date() for t in tasks]
    window = [today - timedelta(days=i) for i in range(13, -1, -1)]
    completed_series = [DayCount(day=d, count=completed_days.count(d)) for d in window]
    created_series = [DayCount(day=d, count=created_days.count(d)) for d in window]
    completed_today = completed_days.count(today)
    completed_last_7 = sum(1 for d in completed_days if today - timedelta(days=6) <= d <= today)

    total = len(tasks)
    done = by_status[Status.DONE]
    rate = round(done / total, 3) if total else 0.0

    return Overview(
        total=total,
        open=total - done,
        by_status=by_status,
        by_priority=by_priority,
        overdue=overdue,
        due_today=due_today,
        due_this_week=due_week,
        completed_today=completed_today,
        completed_last_7_days=completed_last_7,
        completion_rate=rate,
        completed_series=completed_series,
        created_series=created_series,
        projects=await _project_progress(session),
        streak_days=_streak(set(completed_days), today),
    )


def _streak(completed_days: set[date], today: date) -> int:
    """Consecutive days (ending today or yesterday) with at least one completion."""
    day = today if today in completed_days else today - timedelta(days=1)
    streak = 0
    while day in completed_days:
        streak += 1
        day -= timedelta(days=1)
    return streak


async def _project_progress(session: AsyncSession) -> list[ProjectProgress]:
    stmt = select(
        Task.project_id,
        func.count(Task.id),
        func.sum(case((Task.status == Status.DONE, 1), else_=0)),
    ).group_by(Task.project_id)
    rows = (await session.execute(stmt)).all()
    counts = {pid: (int(total), int(done or 0)) for pid, total, done in rows}
    projects = (await session.scalars(select(Project).order_by(Project.name))).all()
    result: list[ProjectProgress] = []
    if None in counts:
        total, done = counts[None]
        result.append(
            ProjectProgress(id=None, name="Inbox", color="#94a3b8", total=total, done=done)
        )
    for p in projects:
        if p.is_archived:
            continue
        total, done = counts.get(p.id, (0, 0))
        result.append(ProjectProgress(id=p.id, name=p.name, color=p.color, total=total, done=done))
    return result

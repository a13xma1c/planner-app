"""Recurrence rules: compute the next due date for a repeating task."""

from __future__ import annotations

from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from planner.models import Recurrence


def next_due_date(current: date, rule: Recurrence, *, after: date | None = None) -> date:
    """Return the next occurrence strictly after ``current``.

    If ``after`` is given (typically "today"), the result is advanced until it is
    later than ``after`` as well, so completing an overdue repeating task doesn't
    create a chain of already-overdue follow-ups.
    """
    nxt = _step(current, rule)
    if after is not None:
        while nxt <= after:
            nxt = _step(nxt, rule)
    return nxt


def _step(d: date, rule: Recurrence) -> date:
    match rule:
        case Recurrence.DAILY:
            return d + timedelta(days=1)
        case Recurrence.WEEKDAYS:
            nxt = d + timedelta(days=1)
            while nxt.weekday() >= 5:  # 5=Sat, 6=Sun
                nxt += timedelta(days=1)
            return nxt
        case Recurrence.WEEKLY:
            return d + timedelta(weeks=1)
        case Recurrence.BIWEEKLY:
            return d + timedelta(weeks=2)
        case Recurrence.MONTHLY:
            return d + relativedelta(months=1)
        case Recurrence.YEARLY:
            return d + relativedelta(years=1)
    raise ValueError(f"Unknown recurrence rule: {rule!r}")  # pragma: no cover

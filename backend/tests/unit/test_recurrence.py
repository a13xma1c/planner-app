from datetime import date

import pytest

from planner.models import Recurrence
from planner.services.recurrence import next_due_date


@pytest.mark.parametrize(
    ("current", "rule", "expected"),
    [
        (date(2025, 1, 31), Recurrence.DAILY, date(2025, 2, 1)),
        (date(2025, 1, 6), Recurrence.WEEKLY, date(2025, 1, 13)),
        (date(2025, 1, 6), Recurrence.BIWEEKLY, date(2025, 1, 20)),
        (date(2025, 1, 31), Recurrence.MONTHLY, date(2025, 2, 28)),  # clamped
        (date(2024, 2, 29), Recurrence.YEARLY, date(2025, 2, 28)),  # leap day clamped
        (date(2025, 1, 10), Recurrence.WEEKDAYS, date(2025, 1, 13)),  # Fri -> Mon
        (date(2025, 1, 11), Recurrence.WEEKDAYS, date(2025, 1, 13)),  # Sat -> Mon
        (date(2025, 1, 13), Recurrence.WEEKDAYS, date(2025, 1, 14)),  # Mon -> Tue
    ],
)
def test_next_due_date(current: date, rule: Recurrence, expected: date):
    assert next_due_date(current, rule) == expected


def test_overdue_recurring_task_skips_past_occurrences():
    # A daily task last due a month ago should come back tomorrow, not 29 days ago.
    today = date(2025, 3, 12)
    assert next_due_date(date(2025, 2, 10), Recurrence.DAILY, after=today) == date(2025, 3, 13)


def test_after_does_not_affect_future_dates():
    today = date(2025, 3, 12)
    assert next_due_date(date(2025, 3, 20), Recurrence.WEEKLY, after=today) == date(2025, 3, 27)


def test_after_equal_to_next_is_skipped():
    today = date(2025, 3, 13)
    assert next_due_date(date(2025, 3, 12), Recurrence.DAILY, after=today) == date(2025, 3, 14)

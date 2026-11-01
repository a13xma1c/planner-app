"""Natural-language "quick add" parser.

Examples of supported input::

    Pay rent tomorrow !high #finance @Home
    Water plants every 2 days          -> (not supported: only fixed rules) -> weekly etc.
    Dentist 2025-03-14 ~1h
    Weekly review every friday #review
    Call mom next monday !urgent
    Submit report in 3 days @"Big Client" p1

Tokens:
    #tag            one or more tags
    @Project        project (quote names containing spaces: @"My Project")
    !high / p1      priority: !urgent|!high|!medium|!low or p1..p4
    ~1h30m          time estimate
    dates           today, tomorrow, mon..sun, next week, in 3 days, 2025-01-31, mar 5, eom
    recurrence      daily, every weekday, weekly, every friday, biweekly, monthly, yearly

Everything that isn't recognised becomes the title.  The parser is pure (no I/O) so
it can be unit-tested exhaustively; project-name resolution happens in ``tasks``.
"""

from __future__ import annotations

import calendar
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from planner.models import Priority, Recurrence

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

_WD = (
    r"(mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?"
    r"|fri(?:day)?|sat(?:urday)?|sun(?:day)?)"
)
_MON = (
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?"
    r"|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_ORD = r"(?:st|nd|rd|th)?"

PRIORITY_WORDS: dict[str, Priority] = {
    "urgent": Priority.URGENT,
    "high": Priority.HIGH,
    "med": Priority.MEDIUM,
    "medium": Priority.MEDIUM,
    "low": Priority.LOW,
    "1": Priority.URGENT,
    "2": Priority.HIGH,
    "3": Priority.MEDIUM,
    "4": Priority.LOW,
}


@dataclass(slots=True)
class ParsedQuickAdd:
    title: str
    tags: list[str] = field(default_factory=list)
    project_name: str | None = None
    priority: Priority = Priority.MEDIUM
    due_date: date | None = None
    recurrence: Recurrence | None = None
    estimate_minutes: int | None = None
    warnings: list[str] = field(default_factory=list)


def parse(text: str, *, today: date | None = None) -> ParsedQuickAdd:
    """Parse ``text`` into structured task fields. Never raises on user input."""
    today = today or date.today()
    result = ParsedQuickAdd(title="")
    work = f" {text.strip()} "

    work = _extract_tags(work, result)
    work = _extract_project(work, result)
    work = _extract_priority(work, result)
    work = _extract_estimate(work, result)
    work = _extract_weekday_recurrence(work, result, today)
    work = _extract_date(work, result, today)
    work = _extract_recurrence(work, result)

    if result.recurrence and result.due_date is None:
        result.due_date = today

    title = re.sub(r"\s+", " ", work).strip(" ,;-")
    if not title:
        result.warnings.append("Title is empty after parsing; using the raw text.")
        title = text.strip()
    result.title = title
    return result


# ── individual extractors ──────────────────────────────────────────────────


def _extract_tags(work: str, r: ParsedQuickAdd) -> str:
    def repl(m: re.Match[str]) -> str:
        name = m.group(1).lower()
        if name not in r.tags:
            r.tags.append(name)
        return " "

    return re.sub(r"(?<!\S)#([\w-]+)", repl, work)


def _extract_project(work: str, r: ParsedQuickAdd) -> str:
    def repl(m: re.Match[str]) -> str:
        name = m.group(1) or m.group(2)
        if r.project_name is not None:
            r.warnings.append(f"Ignoring extra project '@{name}'.")
        else:
            r.project_name = name
        return " "

    return re.sub(r'(?<!\S)@(?:"([^"]+)"|([\w-]+))', repl, work)


def _extract_priority(work: str, r: ParsedQuickAdd) -> str:
    def repl(m: re.Match[str]) -> str:
        r.priority = PRIORITY_WORDS[m.group(1).lower()]
        return " "

    work = re.sub(r"(?<!\S)!(urgent|high|medium|med|low|[1-4])(?!\S)", repl, work, flags=re.I)
    return re.sub(r"(?<!\S)p([1-4])(?!\S)", repl, work, flags=re.I)


def _extract_estimate(work: str, r: ParsedQuickAdd) -> str:
    def repl(m: re.Match[str]) -> str:
        hours = float(m.group(1) or 0)
        minutes = int(m.group(2) or 0)
        total = round(hours * 60) + minutes
        if total > 0:
            r.estimate_minutes = total
        return " "

    pattern = r"(?<!\S)~(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:in)?)?(?!\S)"
    return re.sub(pattern, lambda m: repl(m) if m.group(1) or m.group(2) else m.group(0), work)


def _extract_weekday_recurrence(work: str, r: ParsedQuickAdd, today: date) -> str:
    """ "every <weekday>" = weekly, anchored on that weekday. Runs before date parsing so
    the weekday name isn't consumed as a plain date."""
    m = re.search(rf"\bevery {_WD}\b", work, flags=re.I)
    if not m:
        return work
    r.recurrence = Recurrence.WEEKLY
    r.due_date = _upcoming_weekday(today, WEEKDAYS.index(m.group(1)[:3].lower()))
    return work[: m.start()] + " " + work[m.end() :]


def _extract_recurrence(work: str, r: ParsedQuickAdd) -> str:
    if r.recurrence is not None:
        return work
    # Explicit "every ..." phrases anywhere in the text.
    explicit: list[tuple[str, Recurrence]] = [
        (r"\bevery ?day\b", Recurrence.DAILY),
        (r"\bevery weekday\b", Recurrence.WEEKDAYS),
        (r"\bevery (?:2|two) weeks\b", Recurrence.BIWEEKLY),
        (r"\bevery week\b", Recurrence.WEEKLY),
        (r"\bevery month\b", Recurrence.MONTHLY),
        (r"\bevery year\b", Recurrence.YEARLY),
    ]
    # Bare adverbs only count when they end the text, so "Weekly review" keeps its title
    # while "Review weekly" recurs.
    trailing: list[tuple[str, Recurrence]] = [
        (r"\bdaily\s*$", Recurrence.DAILY),
        (r"\bweekdays\s*$", Recurrence.WEEKDAYS),
        (r"\b(?:bi-?weekly|fortnightly)\s*$", Recurrence.BIWEEKLY),
        (r"\bweekly\s*$", Recurrence.WEEKLY),
        (r"\bmonthly\s*$", Recurrence.MONTHLY),
        (r"\b(?:yearly|annually)\s*$", Recurrence.YEARLY),
    ]
    for pattern, rule in explicit + trailing:
        work, n = re.subn(pattern, " ", work, count=1, flags=re.I)
        if n:
            r.recurrence = rule
            return work
    return work


def _extract_date(work: str, r: ParsedQuickAdd, today: date) -> str:
    """Consume the *earliest* date phrase in the text (later ones stay in the title)."""
    if r.due_date is not None:
        return work

    def set_date(d: date) -> str:
        r.due_date = d
        return " "

    handlers: list[tuple[str, Callable[[re.Match[str]], str]]] = [
        (r"\btoday\b|\btod\b", lambda m: set_date(today)),
        (r"\btomorrow\b|\btmrw?\b", lambda m: set_date(today + timedelta(days=1))),
        (r"\bnext week\b", lambda m: set_date(_upcoming_weekday(today, 0))),
        (
            r"\bnext month\b",
            lambda m: set_date(today.replace(day=1) + relativedelta(months=1)),
        ),
        (r"\bend of month\b|\beom\b", lambda m: set_date(_end_of_month(today))),
        (
            r"\bin (\d+) (day|week|month)s?\b",
            lambda m: set_date(_relative(today, int(m.group(1)), m.group(2))),
        ),
        (
            r"\b(\d{4})-(\d{2})-(\d{2})\b",
            lambda m: _iso(m, r, set_date),
        ),
        (
            rf"\b{_MON}\.? (\d{{1,2}}){_ORD}(?:,? (\d{{4}}))?\b",
            lambda m: set_date(_month_day(today, m.group(1), int(m.group(2)), m.group(3))),
        ),
        (
            rf"\b(\d{{1,2}}){_ORD} {_MON}\.?(?:,? (\d{{4}}))?\b",
            lambda m: set_date(_month_day(today, m.group(2), int(m.group(1)), m.group(3))),
        ),
        (
            rf"\b(?:next |this |on )?{_WD}\b",
            lambda m: set_date(_upcoming_weekday(today, WEEKDAYS.index(m.group(1)[:3].lower()))),
        ),
    ]
    best: tuple[int, re.Match[str], Callable[[re.Match[str]], str]] | None = None
    for pattern, handler in handlers:
        m = re.search(pattern, work, flags=re.I)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), m, handler)
    if best is None:
        return work
    _, m, handler = best
    return work[: m.start()] + handler(m) + work[m.end() :]


# ── date helpers ───────────────────────────────────────────────────────────


def _iso(m: re.Match[str], r: ParsedQuickAdd, set_date: Callable[[date], str]) -> str:
    try:
        d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        r.warnings.append(f"Ignored invalid date '{m.group(0)}'.")
        return m.group(0)
    return set_date(d)


def _upcoming_weekday(today: date, weekday: int) -> date:
    """The next ``weekday`` (0=Mon) strictly after today."""
    delta = (weekday - today.weekday()) % 7
    return today + timedelta(days=delta or 7)


def _end_of_month(today: date) -> date:
    return today.replace(day=calendar.monthrange(today.year, today.month)[1])


def _relative(today: date, n: int, unit: str) -> date:
    match unit:
        case "day":
            return today + timedelta(days=n)
        case "week":
            return today + timedelta(weeks=n)
        case _:
            return today + relativedelta(months=n)


def _month_day(today: date, month_token: str, day: int, year: str | None) -> date:
    month = MONTHS.index(month_token[:3].lower()) + 1
    year_int = int(year) if year else today.year
    last = calendar.monthrange(year_int, month)[1]
    d = date(year_int, month, min(day, last))
    if year is None and d < today:
        d = date(year_int + 1, month, min(day, calendar.monthrange(year_int + 1, month)[1]))
    return d

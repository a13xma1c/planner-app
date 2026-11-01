"""Exhaustive tests for the natural-language quick-add parser."""

from __future__ import annotations

from datetime import date

import pytest

from planner.models import Priority, Recurrence
from planner.services.quick_add import parse

# Wednesday 12 March 2025 is the reference "today" for every case below.
T = date(2025, 3, 12)


def p(text: str):
    return parse(text, today=T)


class TestTitle:
    def test_plain_text_is_the_title(self):
        assert p("Buy milk").title == "Buy milk"

    def test_whitespace_is_collapsed(self):
        assert p("  Buy   milk  ").title == "Buy milk"

    def test_tokens_are_removed_from_title(self):
        r = p("Pay rent tomorrow !high #finance @Home ~1h")
        assert r.title == "Pay rent"

    def test_empty_title_falls_back_to_raw_text_with_warning(self):
        r = p("#only")
        assert r.title == "#only"
        assert r.tags == ["only"]
        assert r.warnings


class TestTags:
    def test_single_tag(self):
        assert p("Task #work").tags == ["work"]

    def test_multiple_tags_deduplicated_and_lowercased(self):
        assert p("Task #Work #home #work").tags == ["work", "home"]

    def test_hash_inside_word_is_not_a_tag(self):
        r = p("Issue#123 fix")
        assert r.tags == []
        assert r.title == "Issue#123 fix"

    def test_hyphenated_tag(self):
        assert p("x #deep-work").tags == ["deep-work"]


class TestProject:
    def test_simple_project(self):
        assert p("Task @Home").project_name == "Home"

    def test_quoted_project_with_spaces(self):
        r = p('Task @"Big Client"')
        assert r.project_name == "Big Client"
        assert r.title == "Task"

    def test_second_project_is_ignored_with_warning(self):
        r = p("Task @A @B")
        assert r.project_name == "A"
        assert any("@B" in w for w in r.warnings)

    def test_email_address_is_not_a_project(self):
        r = p("Email bob@example.com")
        assert r.project_name is None
        assert r.title == "Email bob@example.com"


class TestPriority:
    @pytest.mark.parametrize(
        ("token", "expected"),
        [
            ("!urgent", Priority.URGENT),
            ("!high", Priority.HIGH),
            ("!HIGH", Priority.HIGH),
            ("!medium", Priority.MEDIUM),
            ("!med", Priority.MEDIUM),
            ("!low", Priority.LOW),
            ("!1", Priority.URGENT),
            ("!2", Priority.HIGH),
            ("!3", Priority.MEDIUM),
            ("!4", Priority.LOW),
            ("p1", Priority.URGENT),
            ("P2", Priority.HIGH),
            ("p4", Priority.LOW),
        ],
    )
    def test_priority_tokens(self, token: str, expected: Priority):
        r = p(f"Task {token}")
        assert r.priority == expected
        assert r.title == "Task"

    def test_default_priority_is_medium(self):
        assert p("Task").priority == Priority.MEDIUM

    def test_exclamation_in_title_is_kept(self):
        assert p("Wow! great").title == "Wow! great"

    def test_p_followed_by_other_digits_is_not_priority(self):
        assert p("Upgrade p5 board").title == "Upgrade p5 board"


class TestEstimate:
    @pytest.mark.parametrize(
        ("token", "minutes"),
        [("~30m", 30), ("~2h", 120), ("~1h30m", 90), ("~1.5h", 90), ("~45min", 45)],
    )
    def test_estimates(self, token: str, minutes: int):
        r = p(f"Task {token}")
        assert r.estimate_minutes == minutes
        assert r.title == "Task"

    def test_bare_tilde_is_kept(self):
        r = p("Approx ~ value")
        assert r.estimate_minutes is None
        assert r.title == "Approx ~ value"


class TestDates:
    @pytest.mark.parametrize(
        ("phrase", "expected"),
        [
            ("today", date(2025, 3, 12)),
            ("tod", date(2025, 3, 12)),
            ("tomorrow", date(2025, 3, 13)),
            ("tmr", date(2025, 3, 13)),
            ("tmrw", date(2025, 3, 13)),
            ("next week", date(2025, 3, 17)),  # next Monday
            ("next month", date(2025, 4, 1)),
            ("eom", date(2025, 3, 31)),
            ("end of month", date(2025, 3, 31)),
            ("in 3 days", date(2025, 3, 15)),
            ("in 1 day", date(2025, 3, 13)),
            ("in 2 weeks", date(2025, 3, 26)),
            ("in 1 month", date(2025, 4, 12)),
            ("2025-12-24", date(2025, 12, 24)),
            ("mar 5", date(2026, 3, 5)),  # already passed this year -> next year
            ("march 20", date(2025, 3, 20)),
            ("Mar 20th", date(2025, 3, 20)),
            ("20 mar", date(2025, 3, 20)),
            ("5th jan", date(2026, 1, 5)),
            ("jan 5 2027", date(2027, 1, 5)),
            ("jan 5, 2027", date(2027, 1, 5)),
            ("feb 31", date(2026, 2, 28)),  # clamps to the last day of the month
            ("monday", date(2025, 3, 17)),
            ("mon", date(2025, 3, 17)),
            ("wednesday", date(2025, 3, 19)),  # same weekday -> next week
            ("thu", date(2025, 3, 13)),
            ("next friday", date(2025, 3, 14)),
            ("on sunday", date(2025, 3, 16)),
            ("this saturday", date(2025, 3, 15)),
        ],
    )
    def test_date_phrases(self, phrase: str, expected: date):
        r = p(f"Task {phrase}")
        assert r.due_date == expected, phrase
        assert r.title == "Task", phrase

    def test_invalid_iso_date_is_kept_in_title_with_warning(self):
        r = p("Fix 2025-02-30 bug")
        assert r.due_date is None
        assert r.title == "Fix 2025-02-30 bug"
        assert r.warnings

    def test_earliest_date_phrase_wins_and_later_ones_stay_in_title(self):
        r = p("Task tomorrow today")
        assert r.due_date == date(2025, 3, 13)
        assert r.title == "Task today"

    @pytest.mark.parametrize("word", ["Mary", "Satellite", "Sunset", "Montreal", "Friendly"])
    def test_words_starting_like_weekdays_are_not_dates(self, word: str):
        r = p(f"{word} report")
        assert r.due_date is None
        assert r.title == f"{word} report"

    def test_no_date_by_default(self):
        assert p("Task").due_date is None


class TestRecurrence:
    @pytest.mark.parametrize(
        ("phrase", "rule"),
        [
            ("every day", Recurrence.DAILY),
            ("everyday", Recurrence.DAILY),
            ("daily", Recurrence.DAILY),
            ("every weekday", Recurrence.WEEKDAYS),
            ("weekdays", Recurrence.WEEKDAYS),
            ("every week", Recurrence.WEEKLY),
            ("weekly", Recurrence.WEEKLY),
            ("every 2 weeks", Recurrence.BIWEEKLY),
            ("every two weeks", Recurrence.BIWEEKLY),
            ("biweekly", Recurrence.BIWEEKLY),
            ("fortnightly", Recurrence.BIWEEKLY),
            ("every month", Recurrence.MONTHLY),
            ("monthly", Recurrence.MONTHLY),
            ("every year", Recurrence.YEARLY),
            ("yearly", Recurrence.YEARLY),
            ("annually", Recurrence.YEARLY),
        ],
    )
    def test_recurrence_phrases(self, phrase: str, rule: Recurrence):
        r = p(f"Task {phrase}")
        assert r.recurrence == rule
        assert r.title == "Task"

    def test_recurring_without_date_defaults_to_today(self):
        assert p("Standup daily").due_date == T

    def test_recurring_with_explicit_date(self):
        r = p("Report monthly 2025-04-01")
        assert r.recurrence == Recurrence.MONTHLY
        assert r.due_date == date(2025, 4, 1)

    def test_every_weekday_name_sets_weekly_and_anchor(self):
        r = p("Weekly review every friday #review")
        assert r.recurrence == Recurrence.WEEKLY
        assert r.due_date == date(2025, 3, 14)
        assert r.title == "Weekly review"
        assert r.tags == ["review"]

    def test_leading_adverb_is_part_of_title(self):
        r = p("Weekly review")
        assert r.recurrence is None
        assert r.title == "Weekly review"

    def test_trailing_adverb_is_recurrence(self):
        r = p("Review weekly")
        assert r.recurrence == Recurrence.WEEKLY
        assert r.title == "Review"

    def test_every_month_is_not_a_weekday(self):
        r = p("Budget check every month")
        assert r.recurrence == Recurrence.MONTHLY
        assert r.title == "Budget check"


class TestCombined:
    def test_everything_at_once(self):
        r = p('Submit report in 3 days @"Big Client" p1 #work #q1 ~2h every week')
        assert r.title == "Submit report"
        assert r.project_name == "Big Client"
        assert r.priority == Priority.URGENT
        assert r.tags == ["work", "q1"]
        assert r.estimate_minutes == 120
        assert r.recurrence == Recurrence.WEEKLY
        assert r.due_date == date(2025, 3, 15)
        assert r.warnings == []

    def test_uses_real_today_when_not_given(self):
        assert parse("Task today").due_date == date.today()

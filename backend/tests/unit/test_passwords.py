"""Password policy. The JSON fixture is shared with the frontend mirror (lib/password.ts)."""

import json
from pathlib import Path

import pytest

from planner.services import passwords
from planner.services.passwords import evaluate

CASES = json.loads((Path(__file__).parent.parent / "fixtures" / "password_cases.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=[c["note"] for c in CASES])
def test_shared_cases(case: dict):
    report = evaluate(case["password"], email=case["email"], display_name=case["display_name"])
    assert report.ok == case["ok"]
    assert report.score == case["score"]
    assert report.label == case["label"]
    assert [c.id for c in report.checks if not c.passed] == case["failed"]
    assert report.problem() == case["problem"]


def test_report_shape():
    report = evaluate("orbit-cactus-lantern-7")
    ids = [c.id for c in report.checks]
    assert ids == [
        "length",
        "max_length",
        "whitespace",
        "common",
        "personal",
        "repeat",
        "sequence",
        "variety",
        "long",
    ]
    assert [c.required for c in report.checks] == [True] * 7 + [False, False]
    assert report.suggestions == []
    assert report.failures == []


def test_problem_messages_are_sentences():
    assert evaluate("short").problem() == "Password is shorter than 10 characters."
    assert (
        evaluate("password").problem() == "Password is shorter than 10 characters; is too common."
    )
    assert evaluate("Alice-Smith-99", display_name="Alice Smith").problem() == (
        "Password contains your name or email."
    )


def test_suggestions():
    assert evaluate("blue-ocean-tide").suggestions == [
        "Mixing letters, numbers and symbols adds variety."
    ]
    assert evaluate("Tr0ub4dor&3").suggestions == [
        "Longer is stronger: try a passphrase of several unrelated words."
    ]
    assert evaluate("aabbccddeeff").suggestions[-1] == "Use more distinct characters."


def test_score_is_capped_by_failures():
    # long and varied, but contains the user's name -> never better than "Weak"
    assert evaluate("Alice!Wonderland#2030xyz", display_name="Alice").score == 1
    # common passwords always score 0
    assert evaluate("Password2024!").score == 0


def test_common_list_is_loaded_once_and_lowercase():
    common = passwords.common_passwords()
    assert "password" in common
    assert all(w == w.lower() for w in common)
    assert passwords.common_passwords() is common

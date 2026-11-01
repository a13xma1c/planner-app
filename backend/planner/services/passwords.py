"""Password policy: hard requirements plus an advisory strength score.

The policy follows NIST SP 800-63B: favour length and blocklists over composition
rules. The browser mirrors this module (frontend/src/lib/password.ts) for live
feedback; ``backend/tests/fixtures/password_cases.json`` keeps both in step.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

MIN_LENGTH = 10
MAX_LENGTH = 128
MIN_DISTINCT = 5
MAX_REPEAT_RUN = 3  # "aaaa" (4 in a row) fails
SEQUENCE_LENGTH = 4  # "abcd", "4321", "qwer"
PERSONAL_TOKEN_MIN = 3

KEYBOARD_ROWS = ("qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890")
ALPHABET = "abcdefghijklmnopqrstuvwxyz"

LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"]

_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "common_passwords.txt"


@lru_cache(maxsize=1)
def common_passwords() -> frozenset[str]:
    lines = _DATA_FILE.read_text(encoding="utf-8").splitlines()
    return frozenset(
        line.strip().lower() for line in lines if line.strip() and not line.startswith("#")
    )


@dataclass(slots=True)
class Check:
    id: str
    label: str  # requirement wording, for checklists ("At least 10 characters")
    problem: str  # failure wording, for error messages ("is shorter than 10 characters")
    passed: bool
    required: bool = True


@dataclass(slots=True)
class PasswordReport:
    score: int
    label: str
    ok: bool
    checks: list[Check] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)

    @property
    def failures(self) -> list[Check]:
        return [c for c in self.checks if c.required and not c.passed]

    def problem(self) -> str | None:
        """One human sentence describing why the password was rejected, or None."""
        failures = self.failures
        if failures:
            return "Password " + "; ".join(c.problem for c in failures) + "."
        if not self.ok:
            return "Password is too weak: add length or variety."
        return None


# ── helpers ──────────────────────────────────────────────────────────────────


def _personal_tokens(email: str | None, display_name: str | None) -> list[str]:
    tokens: list[str] = []
    if email:
        email = email.strip().lower()
        tokens.append(email)
        local = email.split("@", 1)[0]
        tokens.extend(re.split(r"[._\-+]+", local))
    if display_name:
        tokens.extend(display_name.lower().split())
    return sorted({t for t in tokens if len(t) >= PERSONAL_TOKEN_MIN})


LEET = str.maketrans(
    {"@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "0": "o", "$": "s", "5": "s", "7": "t"}
)


def _strip_padding(value: str) -> str:
    return re.sub(r"^[^a-z]+|[^a-z]+$", "", value)


def _is_common(password: str) -> bool:
    """Exact match; match after stripping digit/symbol padding ("Password2024!"); match
    after undoing leetspeak ("P@ssw0rd"); or a password made only of common words
    ("letmein-letmein", "dragon-master-2030")."""
    common = common_passwords()
    lowered = password.lower()
    stripped = _strip_padding(lowered)
    variants = {lowered, stripped, lowered.translate(LEET), stripped.translate(LEET)}
    variants |= {_strip_padding(v) for v in list(variants)}
    if any(len(v) >= 4 and v in common for v in variants):
        return True
    for variant in (lowered, lowered.translate(LEET)):
        words = [w for w in re.split(r"[^a-z]+", variant) if len(w) >= 3]
        if words and all(w in common for w in words):
            return True
    return False


def _has_repeat_run(password: str) -> bool:
    return re.search(rf"(.)\1{{{MAX_REPEAT_RUN},}}", password) is not None


def _has_sequence(password: str) -> bool:
    lowered = password.lower()
    n = SEQUENCE_LENGTH
    for i in range(len(lowered) - n + 1):
        chunk = lowered[i : i + n]
        if not chunk.isalnum():
            continue
        for row in (*KEYBOARD_ROWS, ALPHABET):
            if chunk in row or chunk in row[::-1]:
                return True
    return False


def _classes(password: str) -> int:
    return sum(
        1
        for pattern in (r"[a-z]", r"[A-Z]", r"[0-9]", r"[^a-zA-Z0-9]")
        if re.search(pattern, password)
    )


# ── evaluation ───────────────────────────────────────────────────────────────


def evaluate(
    password: str, *, email: str | None = None, display_name: str | None = None
) -> PasswordReport:
    """Run every rule and compute the advisory score. Never raises."""
    length = len(password)
    distinct = len(set(password))
    tokens = _personal_tokens(email, display_name)
    lowered = password.lower()

    checks = [
        Check(
            "length",
            f"At least {MIN_LENGTH} characters",
            f"is shorter than {MIN_LENGTH} characters",
            length >= MIN_LENGTH,
        ),
        Check(
            "max_length",
            f"At most {MAX_LENGTH} characters",
            f"is longer than {MAX_LENGTH} characters",
            length <= MAX_LENGTH,
        ),
        Check(
            "whitespace",
            "No spaces at the start or end",
            "starts or ends with a space",
            password == password.strip(),
        ),
        Check(
            "common",
            "Not a commonly used password",
            "is too common",
            length > 0 and not _is_common(password),
        ),
        Check(
            "personal",
            "Doesn't contain your name or email",
            "contains your name or email",
            not any(t in lowered for t in tokens),
        ),
        Check(
            "repeat",
            "No long runs of the same character",
            "repeats the same characters too much",
            length > 0 and not _has_repeat_run(password) and distinct >= min(MIN_DISTINCT, length),
        ),
        Check(
            "sequence",
            "No predictable sequences like abcd, 1234 or qwerty",
            "contains a predictable sequence",
            not _has_sequence(password),
        ),
        Check(
            "variety",
            "Mixes letters, numbers and symbols",
            "uses few kinds of characters",
            _classes(password) >= 3,
            required=False,
        ),
        Check(
            "long",
            "14+ characters (a passphrase works well)",
            "is on the short side",
            length >= 14,
            required=False,
        ),
    ]

    score = 0
    if length >= MIN_LENGTH:
        score += 1
    if length >= 14:
        score += 1
    if length >= 20:
        score += 1
    if _classes(password) >= 3:
        score += 1
    if distinct >= 8:
        score += 1
    score = min(score, 4)
    if any(c.required and not c.passed for c in checks):
        score = min(score, 1)
    if not checks[3].passed:  # common
        score = 0

    suggestions: list[str] = []
    if length < 14:
        suggestions.append("Longer is stronger: try a passphrase of several unrelated words.")
    if _classes(password) < 3:
        suggestions.append("Mixing letters, numbers and symbols adds variety.")
    if distinct < 8 and length >= MIN_LENGTH:
        suggestions.append("Use more distinct characters.")

    ok = all(c.passed for c in checks if c.required) and score >= 2
    return PasswordReport(
        score=score, label=LABELS[score], ok=ok, checks=checks, suggestions=suggestions
    )

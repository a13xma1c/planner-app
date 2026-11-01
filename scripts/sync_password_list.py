#!/usr/bin/env python3
"""Copy backend/planner/data/common_passwords.txt into frontend/src/lib/commonPasswords.ts.

The backend file is the source of truth; the frontend mirror exists so the sign-up form
can give instant feedback. A frontend test fails when the two drift apart.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "backend" / "planner" / "data" / "common_passwords.txt"
TARGET = ROOT / "frontend" / "src" / "lib" / "commonPasswords.ts"


def main() -> None:
    words = [
        line.strip().lower()
        for line in SOURCE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    rows = [", ".join(f"'{w}'" for w in words[i : i + 8]) for i in range(0, len(words), 8)]
    body = ",\n".join(f"  {row}" for row in rows)
    TARGET.write_text(
        "// GENERATED from backend/planner/data/common_passwords.txt — do not edit by hand.\n"
        "// Regenerate with `make password-list`; src/lib/password.test.ts fails when out of sync.\n"
        "export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([\n"
        f"{body},\n])\n",
        encoding="utf-8",
    )
    print(f"wrote {len(words)} entries to {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

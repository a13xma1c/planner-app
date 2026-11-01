"""CLI commands (Typer) against a temporary database."""

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from planner.cli import app
from planner.config import get_settings

runner = CliRunner()


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "cli.db"
    monkeypatch.setenv("PLANNER_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


def test_migrate(env: Path):
    result = runner.invoke(app, ["migrate"])
    assert result.exit_code == 0, result.output
    assert "up to date" in result.output


def test_create_user_and_list_users(env: Path):
    result = runner.invoke(
        app,
        ["create-user", "Ann@Example.com", "--name", "Ann", "--password", "orbit-cactus-lantern-7"],
    )
    assert result.exit_code == 0, result.output
    assert "Created user ann@example.com" in result.output
    result = runner.invoke(app, ["users"])
    assert result.exit_code == 0, result.output
    assert "ann@example.com" in result.output
    assert "Ann's planner (owner)" in result.output
    # duplicates are reported as a clean error
    result = runner.invoke(
        app,
        ["create-user", "ann@example.com", "--name", "Ann", "--password", "orbit-cactus-lantern-7"],
    )
    assert result.exit_code == 1
    assert "already exists" in result.output


def test_data_commands_need_an_account_or_an_explicit_target(env: Path):
    result = runner.invoke(app, ["list"])
    assert result.exit_code == 1
    assert "create-user" in result.output
    for email in ("a@example.com", "b@example.com"):
        runner.invoke(
            app, ["create-user", email, "--name", "x", "--password", "orbit-cactus-lantern-7"]
        )
    result = runner.invoke(app, ["list"])
    assert result.exit_code == 1
    assert "--user" in result.output
    assert runner.invoke(app, ["list", "--user", "a@example.com"]).exit_code == 0
    assert runner.invoke(app, ["list", "--workspace", "1"]).exit_code == 0
    result = runner.invoke(app, ["list", "--user", "nobody@example.com"])
    assert result.exit_code == 1
    assert "No user" in result.output


def test_import_legacy_then_list_and_export(env: Path):
    runner.invoke(
        app,
        ["create-user", "me@example.com", "--name", "Me", "--password", "orbit-cactus-lantern-7"],
    )
    legacy = env / "planner_data.json"
    legacy.write_text(
        json.dumps(
            {
                "tasks": [
                    {
                        "id": 1,
                        "title": "Legacy task",
                        "project": "Work",
                        "priority": "high",
                        "status": "todo",
                        "due_date": "2030-01-01",
                        "notes": "",
                    },
                    {"id": 2, "title": "Done thing", "project": "Inbox", "status": "done"},
                ],
                "projects": [{"name": "Inbox"}, {"name": "Work", "description": ""}],
                "next_id": 3,
            }
        )
    )
    result = runner.invoke(app, ["import-legacy", str(legacy)])
    assert result.exit_code == 0, result.output
    assert "Imported 2 tasks and 1 projects" in result.output

    result = runner.invoke(app, ["list"])
    assert result.exit_code == 0, result.output
    assert "Legacy task" in result.output
    assert "Done thing" not in result.output

    result = runner.invoke(app, ["list", "--all"])
    assert "Done thing" in result.output

    out = env / "export.json"
    result = runner.invoke(app, ["export", str(out)])
    assert result.exit_code == 0, result.output
    bundle = json.loads(out.read_text())
    assert len(bundle["tasks"]) == 2

    result = runner.invoke(app, ["import", str(out), "--replace"])
    assert result.exit_code == 0, result.output
    assert "2 tasks" in result.output


def test_import_missing_file(env: Path):
    result = runner.invoke(app, ["import-legacy", str(env / "nope.json")])
    assert result.exit_code != 0


def test_serve_invokes_uvicorn(env: Path, monkeypatch: pytest.MonkeyPatch):
    calls: list[dict] = []
    monkeypatch.setattr("planner.cli.uvicorn.run", lambda *a, **kw: calls.append(kw))
    result = runner.invoke(app, ["serve", "--port", "9999"])
    assert result.exit_code == 0, result.output
    assert calls[0]["port"] == 9999
    assert calls[0]["host"] == "127.0.0.1"

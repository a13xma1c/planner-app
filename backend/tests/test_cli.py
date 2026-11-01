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


def test_import_legacy_then_list_and_export(env: Path):
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

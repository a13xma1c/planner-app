"""Application settings, loaded from the environment (prefix ``PLANNER_``)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = Path.home() / ".planner"


class Settings(BaseSettings):
    """Runtime configuration.

    Every field can be overridden with an environment variable, e.g.
    ``PLANNER_DATABASE_URL=sqlite+aiosqlite:///./dev.db``.
    """

    model_config = SettingsConfigDict(env_prefix="PLANNER_", env_file=".env", extra="ignore")

    data_dir: Path = Field(default=DEFAULT_DATA_DIR, description="Directory for the SQLite DB.")
    database_url: str | None = Field(
        default=None,
        description="SQLAlchemy URL. Defaults to an aiosqlite DB inside ``data_dir``.",
    )
    frontend_dist: Path = Field(
        default=PACKAGE_DIR.parent.parent / "frontend" / "dist",
        description="Built frontend assets to serve at '/'.",
    )
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        description="Origins allowed during frontend development.",
    )
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = False

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{self.data_dir / 'planner.db'}"


@lru_cache
def get_settings() -> Settings:
    return Settings()

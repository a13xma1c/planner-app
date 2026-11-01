"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from planner.api import api_router
from planner.config import Settings, get_settings
from planner.db import Database
from planner.schemas import Health
from planner.services.errors import ConflictError, NotFoundError, PlannerError, ValidationError

log = logging.getLogger("planner")

try:
    __version__ = version("planner")
except PackageNotFoundError:  # pragma: no cover - running from a source checkout
    __version__ = "0.0.0-dev"


def create_app(settings: Settings | None = None, *, database: Database | None = None) -> FastAPI:
    """Build the ASGI app. Tests inject a pre-configured ``Database``."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = database or Database(settings.resolved_database_url, echo=settings.debug)
        await db.migrate()
        app.state.db = db
        log.info("Planner %s ready (db=%s)", __version__, db.url)
        try:
            yield
        finally:
            if database is None:
                await db.dispose()

    app = FastAPI(
        title="Planner API",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _register_error_handlers(app)
    app.include_router(api_router)

    @app.get("/api/health", response_model=Health, tags=["meta"])
    async def health(request: Request) -> Health:
        db: Database = request.app.state.db
        return Health(version=__version__, database=db.url.rsplit("/", 1)[-1])

    _mount_frontend(app, settings)
    return app


def _register_error_handlers(app: FastAPI) -> None:
    status_for: dict[type[PlannerError], int] = {
        NotFoundError: 404,
        ConflictError: 409,
        ValidationError: 422,
    }

    @app.exception_handler(PlannerError)
    async def handle_domain_error(_: Request, exc: PlannerError) -> JSONResponse:
        code = next((s for cls, s in status_for.items() if isinstance(exc, cls)), 400)
        return JSONResponse(status_code=code, content={"detail": exc.message})


def _mount_frontend(app: FastAPI, settings: Settings) -> None:
    """Serve the built SPA (if present) with history-API fallback."""
    dist = settings.frontend_dist
    index = dist / "index.html"
    if not index.is_file():
        log.info("Frontend build not found at %s; serving API only.", dist)
        return

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)


app = create_app()

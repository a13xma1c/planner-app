"""HTTP layer (FastAPI routers)."""

from fastapi import APIRouter

from planner.api import data, projects, stats, subtasks, tags, tasks

api_router = APIRouter(prefix="/api")
api_router.include_router(tasks.router)
api_router.include_router(subtasks.router)
api_router.include_router(projects.router)
api_router.include_router(tags.router)
api_router.include_router(stats.router)
api_router.include_router(data.router)

__all__ = ["api_router"]

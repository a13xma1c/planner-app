"""HTTP layer (FastAPI routers)."""

from fastapi import APIRouter

from planner.api import (
    auth,
    comments,
    data,
    events,
    projects,
    stats,
    subtasks,
    tags,
    tasks,
    workspaces,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(workspaces.router)
api_router.include_router(workspaces.join_router)
api_router.include_router(tasks.router)
api_router.include_router(subtasks.router)
api_router.include_router(comments.router)
api_router.include_router(projects.router)
api_router.include_router(tags.router)
api_router.include_router(stats.router)
api_router.include_router(data.router)
api_router.include_router(events.router)

__all__ = ["api_router"]

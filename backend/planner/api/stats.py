"""Dashboard statistics endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from planner.api.deps import SessionDep
from planner.schemas import Overview
from planner.services import stats as svc

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview", response_model=Overview)
async def overview(session: SessionDep) -> Overview:
    return await svc.overview(session)

"""Export / import endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body

from planner.api.deps import SessionDep
from planner.schemas import ExportBundle, ImportBundle, ImportResult
from planner.services import transfer as svc

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/export", response_model=ExportBundle)
async def export_all(session: SessionDep) -> ExportBundle:
    return await svc.export_all(session)


@router.post("/import", response_model=ImportResult)
async def import_bundle(
    session: SessionDep, payload: ImportBundle, replace: bool = False
) -> ImportResult:
    return await svc.import_bundle(session, payload, replace=replace)


@router.post("/import/legacy", response_model=ImportResult)
async def import_legacy(session: SessionDep, payload: dict[str, Any] = Body(...)) -> ImportResult:
    return await svc.import_legacy(session, payload)

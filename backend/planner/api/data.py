"""Export / import endpoints (scoped to the current workspace)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body

from planner.api.deps import EditorCtx, Notify, SessionDep, ViewerCtx
from planner.schemas import ExportBundle, ImportBundle, ImportResult
from planner.services import transfer as svc

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/export", response_model=ExportBundle)
async def export_all(session: SessionDep, ctx: ViewerCtx) -> ExportBundle:
    return await svc.export_all(session, ctx.id)


@router.post("/import", response_model=ImportResult)
async def import_bundle(
    session: SessionDep,
    ctx: EditorCtx,
    notify: Notify,
    payload: ImportBundle,
    replace: bool = False,
) -> ImportResult:
    result = await svc.import_bundle(session, ctx.id, payload, replace=replace)
    notify("all")
    return result


@router.post("/import/legacy", response_model=ImportResult)
async def import_legacy(
    session: SessionDep, ctx: EditorCtx, notify: Notify, payload: dict[str, Any] = Body(...)
) -> ImportResult:
    result = await svc.import_legacy(session, ctx.id, payload)
    notify("all")
    return result

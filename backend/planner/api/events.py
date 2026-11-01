"""Server-Sent Events stream of workspace changes."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from planner.api.deps import ViewerCtx, get_broadcaster
from planner.services.events import Broadcaster

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
async def stream(
    request: Request,
    ctx: ViewerCtx,
    broadcaster: Annotated[Broadcaster, Depends(get_broadcaster)],
    keepalive: Annotated[float, Query(ge=1, le=120)] = 15,
) -> StreamingResponse:
    """``text/event-stream`` of ``changed`` events for the selected workspace.

    Clients re-fetch their data when an event arrives; the stream carries no task data.
    """
    workspace_id = ctx.id

    async def generate() -> AsyncIterator[str]:
        async for frame in broadcaster.subscribe(workspace_id, keepalive=keepalive):
            if await request.is_disconnected():
                break
            yield frame

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

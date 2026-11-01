"""FastAPI dependencies."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from planner.db import Database


def get_db(request: Request) -> Database:
    db: Database = request.app.state.db
    return db


async def get_session(db: Annotated[Database, Depends(get_db)]) -> AsyncIterator[AsyncSession]:
    async with db.session_factory() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]

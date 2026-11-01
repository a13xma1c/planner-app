"""In-process pub/sub used to push "something changed" events to connected clients.

Each browser tab subscribes to its current workspace (Server-Sent Events); after every
successful mutation the API publishes a small event and clients re-fetch what they show.
Keeping the payload coarse ("tasks changed") keeps the server stateless and simple.
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass(slots=True)
class Event:
    kind: str
    entity: str
    workspace_id: int
    actor_id: int | None = None
    data: dict[str, Any] = field(default_factory=dict)

    def to_sse(self) -> str:
        payload = {
            "kind": self.kind,
            "entity": self.entity,
            "workspace_id": self.workspace_id,
            "actor_id": self.actor_id,
            "at": datetime.now(UTC).isoformat(),
            **self.data,
        }
        return f"event: {self.kind}\ndata: {json.dumps(payload)}\n\n"


class Broadcaster:
    def __init__(self, *, queue_size: int = 100) -> None:
        self._subscribers: dict[int, set[asyncio.Queue[Event]]] = defaultdict(set)
        self._queue_size = queue_size

    def subscriber_count(self, workspace_id: int) -> int:
        return len(self._subscribers.get(workspace_id, ()))

    def publish(self, event: Event) -> int:
        """Deliver to every subscriber of the workspace; slow consumers drop events."""
        delivered = 0
        for queue in list(self._subscribers.get(event.workspace_id, ())):
            try:
                queue.put_nowait(event)
                delivered += 1
            except asyncio.QueueFull:  # pragma: no cover - defensive
                pass
        return delivered

    async def subscribe(self, workspace_id: int, *, keepalive: float = 15.0) -> AsyncIterator[str]:
        """Yield SSE frames for a workspace until the consumer stops iterating."""
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._queue_size)
        self._subscribers[workspace_id].add(queue)
        try:
            yield ": connected\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=keepalive)
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield event.to_sse()
        finally:
            self._subscribers[workspace_id].discard(queue)
            if not self._subscribers[workspace_id]:
                del self._subscribers[workspace_id]

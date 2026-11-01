"""A small in-process sliding-window rate limiter for the authentication endpoints.

Good enough for a single-process deployment (which is what this app targets); put a
reverse proxy limiter in front for anything bigger. Keys are opaque strings such as
``login:ip:203.0.113.9`` or ``login:email:ann@example.com``.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Limit:
    """At most ``requests`` hits per ``window`` seconds."""

    requests: int
    window: float


class RateLimiter:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._clock = clock

    def check(self, key: str, limit: Limit) -> float:
        """Record a hit for ``key``; return seconds to wait (0 when allowed)."""
        now = self._clock()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - limit.window:
                hits.popleft()
            if len(hits) >= limit.requests:
                return max(0.0, hits[0] + limit.window - now)
            hits.append(now)
            return 0.0

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def prune(self) -> int:
        """Drop keys with no recent hits (called periodically); returns removed count."""
        now = self._clock()
        removed = 0
        with self._lock:
            for key in list(self._hits):
                hits = self._hits[key]
                while hits and hits[0] <= now - 3600:
                    hits.popleft()
                if not hits:
                    del self._hits[key]
                    removed += 1
        return removed

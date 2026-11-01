"""Pure-ASGI middleware: security headers and a cross-site write guard.

Implemented at the ASGI level (not ``BaseHTTPMiddleware``) so streaming responses
such as the Server-Sent Events feed are untouched.
"""

from __future__ import annotations

import hashlib
import re
from base64 import b64encode
from collections.abc import Iterable
from pathlib import Path
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Message, Receive, Scope, Send

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def inline_script_hashes(index_html: Path) -> list[str]:
    """CSP hashes for inline ``<script>`` blocks in the built index.html (theme bootstrap)."""
    if not index_html.is_file():
        return []
    html = index_html.read_text(encoding="utf-8")
    hashes = []
    for body in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, flags=re.S):
        digest = hashlib.sha256(body.encode("utf-8")).digest()
        hashes.append(f"'sha256-{b64encode(digest).decode()}'")
    return hashes


def content_security_policy(script_hashes: Iterable[str]) -> str:
    scripts = " ".join(["'self'", *script_hashes])
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src {scripts}",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
    )


class SecurityMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        allowed_origins: Iterable[str] = (),
        csp: str | None = None,
        hsts: bool = False,
    ) -> None:
        self.app = app
        self.allowed_origins = {o.rstrip("/") for o in allowed_origins}
        self.csp = csp
        self.hsts = hsts

    @staticmethod
    def _header(scope: Scope, name: bytes) -> str | None:
        for key, value in scope.get("headers", []):
            if key == name:
                return str(value.decode("latin-1"))
        return None

    def _cross_site_write(self, scope: Scope) -> bool:
        """True when a state-changing API request comes from another site."""
        if scope["method"] not in UNSAFE_METHODS or not scope["path"].startswith("/api/"):
            return False
        fetch_site = self._header(scope, b"sec-fetch-site")
        if fetch_site == "cross-site":
            return True
        origin = self._header(scope, b"origin")
        if origin is None or origin == "null":
            return origin == "null"
        if origin.rstrip("/") in self.allowed_origins:
            return False
        host = self._header(scope, b"host") or ""
        return urlsplit(origin).netloc.lower() != host.lower()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if self._cross_site_write(scope):
            body = b'{"detail":"Cross-site requests are not allowed"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers += [
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"x-frame-options", b"DENY"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                ]
                if self.csp and not scope["path"].startswith("/api/"):
                    headers.append((b"content-security-policy", self.csp.encode()))
                if self.hsts:
                    headers.append(
                        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                    )
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)

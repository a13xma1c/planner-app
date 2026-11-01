"""Registration, login, sessions and profile."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from planner.api.deps import SESSION_COOKIE, AuthPair, CurrentUser, SessionDep
from planner.config import Settings
from planner.schemas import (
    LoginRequest,
    PasswordChange,
    PasswordCheckItem,
    PasswordCheckRequest,
    PasswordReport,
    ProfileUpdate,
    RegisterRequest,
    SessionRead,
    UserRead,
)
from planner.services import auth as svc
from planner.services import passwords
from planner.services.errors import ForbiddenError, RateLimitedError, UnauthorizedError
from planner.services.ratelimit import Limit, RateLimiter

router = APIRouter(prefix="/auth", tags=["auth"])


def client_ip(request: Request) -> str:
    settings: Settings = request.app.state.settings
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _throttle(request: Request, key: str, limit: Limit, what: str) -> None:
    settings: Settings = request.app.state.settings
    if not settings.rate_limit_enabled:
        return
    limiter: RateLimiter = request.app.state.rate_limiter
    wait = limiter.check(key, limit)
    if wait > 0:
        raise RateLimitedError(f"Too many {what}; try again in {int(wait + 0.999)} seconds", wait)


def _set_cookie(request: Request, response: Response, token: str) -> None:
    settings: Settings = request.app.state.settings
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(svc.SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
        path="/",
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request, response: Response, session: SessionDep, payload: RegisterRequest
) -> UserRead:
    settings: Settings = request.app.state.settings
    _throttle(
        request,
        f"register:ip:{client_ip(request)}",
        Limit(settings.register_attempts_per_hour, 3600),
        "sign-up attempts",
    )
    if not settings.allow_registration and await svc.user_count(session) > 0:
        raise ForbiddenError("Registration is disabled; ask an existing user for an invite")
    user = await svc.register(session, payload)
    token = await svc.create_session(
        session, user, user_agent=request.headers.get("user-agent", "")
    )
    _set_cookie(request, response, token)
    return UserRead.model_validate(user)


@router.post("/login", response_model=UserRead)
async def login(
    request: Request, response: Response, session: SessionDep, payload: LoginRequest
) -> UserRead:
    settings: Settings = request.app.state.settings
    ip_key = f"login:ip:{client_ip(request)}"
    email_key = f"login:email:{payload.email}"
    _throttle(request, ip_key, Limit(settings.login_attempts_per_minute, 60), "sign-in attempts")
    _throttle(
        request,
        email_key,
        Limit(settings.login_attempts_per_email_per_15min, 15 * 60),
        "sign-in attempts for this account",
    )
    user = await svc.authenticate(session, payload.email, payload.password)
    if user is None:
        raise UnauthorizedError("Incorrect email or password")
    limiter: RateLimiter = request.app.state.rate_limiter
    limiter.reset(email_key)  # a successful sign-in clears the per-account counter
    token = await svc.create_session(
        session, user, user_agent=request.headers.get("user-agent", "")
    )
    _set_cookie(request, response, token)
    return UserRead.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, session: SessionDep) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await svc.revoke_session(session, token)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", response_model=UserRead)
async def update_me(session: SessionDep, user: CurrentUser, payload: ProfileUpdate) -> UserRead:
    return UserRead.model_validate(await svc.update_profile(session, user, payload))


@router.post("/password/check", response_model=PasswordReport)
async def check_password(request: Request, payload: PasswordCheckRequest) -> PasswordReport:
    """Evaluate a candidate password against the policy (no account needed).

    The browser mirrors the rules for instant feedback; this endpoint is the reference
    implementation and what the sign-up / change-password endpoints enforce.
    """
    _throttle(request, f"pwcheck:ip:{client_ip(request)}", Limit(120, 60), "password checks")
    report = passwords.evaluate(
        payload.password, email=payload.email, display_name=payload.display_name
    )
    return PasswordReport(
        score=report.score,
        label=report.label,
        ok=report.ok,
        checks=[
            PasswordCheckItem(
                id=c.id, label=c.label, problem=c.problem, passed=c.passed, required=c.required
            )
            for c in report.checks
        ],
        suggestions=report.suggestions,
        problem=report.problem(),
    )


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(session: SessionDep, user: CurrentUser, payload: PasswordChange) -> None:
    await svc.change_password(session, user, payload)


@router.get("/sessions", response_model=list[SessionRead])
async def sessions(session: SessionDep, auth_pair: AuthPair) -> list[SessionRead]:
    user, current = auth_pair
    rows = await svc.list_sessions(session, user)
    return [
        SessionRead.model_validate(s).model_copy(update={"is_current": s.id == current.id})
        for s in rows
    ]


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(session: SessionDep, auth_pair: AuthPair) -> dict[str, int]:
    user, current = auth_pair
    return {"revoked": await svc.revoke_other_sessions(session, user, current)}

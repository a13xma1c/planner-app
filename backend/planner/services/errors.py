"""Domain exceptions translated to HTTP responses by the API layer."""


class PlannerError(Exception):
    """Base class for domain errors."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(PlannerError):
    """The requested entity does not exist."""


class ConflictError(PlannerError):
    """The operation conflicts with existing state (e.g. duplicate name)."""


class ValidationError(PlannerError):
    """The request was well-formed but semantically invalid."""


class UnauthorizedError(PlannerError):
    """No valid session."""


class ForbiddenError(PlannerError):
    """The user is authenticated but not allowed to do this."""


class RateLimitedError(PlannerError):
    """Too many attempts; ``retry_after`` is in seconds."""

    def __init__(self, message: str, retry_after: float) -> None:
        super().__init__(message)
        self.retry_after = retry_after

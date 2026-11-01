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

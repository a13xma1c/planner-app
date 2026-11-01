"""Pydantic schemas: the public API contract."""

from __future__ import annotations

import re
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from planner.models import Priority, Recurrence, Role, Status

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

Title = Annotated[str, Field(min_length=1, max_length=200)]
Name = Annotated[str, Field(min_length=1, max_length=100)]
TagName = Annotated[str, Field(min_length=1, max_length=50)]
Color = Annotated[str, Field(pattern=HEX_COLOR.pattern)]


def _strip(value: object) -> object:
    """Strip surrounding whitespace *before* length constraints are checked."""
    return value.strip() if isinstance(value, str) else value


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Users & auth ─────────────────────────────────────────────────────────────

Email = Annotated[str, Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
# Length and strength are enforced by services.passwords (with the user's context), so the
# schema only bounds the size of what we accept.
Password = Annotated[str, Field(min_length=1, max_length=256)]
DisplayName = Annotated[str, Field(min_length=1, max_length=100)]


def _normalise_email(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


class UserRead(ORMModel):
    id: int
    email: str
    display_name: str


class UserPublic(ORMModel):
    """What other members of a workspace may see about a user."""

    id: int
    display_name: str


class RegisterRequest(BaseModel):
    email: Email
    password: Password
    display_name: DisplayName

    _email = field_validator("email", mode="before")(_normalise_email)
    _name = field_validator("display_name", mode="before")(_strip)


class LoginRequest(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=128)

    _email = field_validator("email", mode="before")(_normalise_email)


class ProfileUpdate(BaseModel):
    display_name: DisplayName | None = None
    _name = field_validator("display_name", mode="before")(_strip)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class PasswordCheckRequest(BaseModel):
    password: str = Field(max_length=256)
    email: str | None = Field(default=None, max_length=254)
    display_name: str | None = Field(default=None, max_length=100)


class PasswordCheckItem(BaseModel):
    id: str
    label: str
    problem: str
    passed: bool
    required: bool


class PasswordReport(BaseModel):
    score: int = Field(ge=0, le=4)
    label: str
    ok: bool
    checks: list[PasswordCheckItem]
    suggestions: list[str]
    problem: str | None = None


class SessionRead(ORMModel):
    id: int
    created_at: datetime
    last_seen_at: datetime
    user_agent: str
    is_current: bool = False


# ── Workspaces ───────────────────────────────────────────────────────────────


class WorkspaceCreate(BaseModel):
    name: Name
    _strip_name = field_validator("name", mode="before")(_strip)


class WorkspaceUpdate(BaseModel):
    name: Name | None = None
    _strip_name = field_validator("name", mode="before")(_strip)


class WorkspaceRead(ORMModel):
    id: int
    name: str
    is_personal: bool
    created_at: datetime


class WorkspaceSummary(WorkspaceRead):
    """A workspace as seen by one of its members."""

    role: Role
    member_count: int = 1
    open_task_count: int = 0


class MemberRead(BaseModel):
    user: UserPublic
    role: Role
    joined_at: datetime


class MemberUpdate(BaseModel):
    role: Role


class InvitationCreate(BaseModel):
    role: Role = Role.EDITOR
    email: Email | None = None
    expires_in_days: int = Field(default=7, ge=1, le=90)
    max_uses: int | None = Field(default=None, ge=1, le=1000)

    _email = field_validator("email", mode="before")(_normalise_email)

    @field_validator("role")
    @classmethod
    def _no_owner_invites(cls, v: Role) -> Role:
        if v == Role.OWNER:
            raise ValueError("invite links cannot grant the owner role")
        return v


class InvitationRead(ORMModel):
    id: int
    token: str
    role: Role
    email: str | None
    created_at: datetime
    expires_at: datetime
    max_uses: int | None
    use_count: int
    revoked_at: datetime | None
    is_valid: bool


class InvitationPreview(BaseModel):
    """What a visitor sees before accepting an invitation."""

    workspace_name: str
    role: Role
    invited_by: str | None
    member_count: int
    is_valid: bool
    email: str | None = None


# ── Comments ─────────────────────────────────────────────────────────────────


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    _strip_body = field_validator("body", mode="before")(_strip)


class CommentRead(ORMModel):
    id: int
    task_id: int
    author: UserPublic | None
    body: str
    created_at: datetime
    updated_at: datetime


# ── Tags ─────────────────────────────────────────────────────────────────────


def normalise_tag_name(value: str) -> str:
    """Tags are stored lower-case, without a leading ``#`` and without whitespace."""
    value = value.strip().lstrip("#").lower()
    if not value:
        raise ValueError("tag name cannot be empty")
    if any(ch.isspace() for ch in value):
        raise ValueError("tag names cannot contain whitespace")
    return value


def _normalise_optional_tag(value: str | None) -> str | None:
    return normalise_tag_name(value) if value is not None else None


def _normalise_tag_list(values: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for v in values:
        seen.setdefault(normalise_tag_name(v), None)
    return list(seen)


def _normalise_optional_tag_list(values: list[str] | None) -> list[str] | None:
    return _normalise_tag_list(values) if values is not None else None


class TagBase(BaseModel):
    name: TagName
    color: Color = "#64748b"

    _normalise = field_validator("name")(normalise_tag_name)


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: TagName | None = None
    color: Color | None = None

    _normalise = field_validator("name")(_normalise_optional_tag)


class TagRead(ORMModel):
    id: int
    name: str
    color: str


class TagWithCount(TagRead):
    task_count: int = 0


# ── Projects ─────────────────────────────────────────────────────────────────


class ProjectBase(BaseModel):
    name: Name
    description: str = Field(default="", max_length=2000)
    color: Color = "#6366f1"

    _strip_name = field_validator("name", mode="before")(_strip)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Name | None = None
    description: str | None = Field(default=None, max_length=2000)
    color: Color | None = None
    is_archived: bool | None = None

    _strip_name = field_validator("name", mode="before")(_strip)


class ProjectRead(ORMModel):
    id: int
    name: str
    description: str
    color: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class ProjectWithStats(ProjectRead):
    task_count: int = 0
    done_count: int = 0
    overdue_count: int = 0


# ── Subtasks ─────────────────────────────────────────────────────────────────


class SubtaskCreate(BaseModel):
    title: Title
    _strip_title = field_validator("title", mode="before")(_strip)


class SubtaskUpdate(BaseModel):
    title: Title | None = None
    is_done: bool | None = None
    position: int | None = None


class SubtaskRead(ORMModel):
    id: int
    task_id: int
    title: str
    is_done: bool
    position: int


# ── Tasks ────────────────────────────────────────────────────────────────────


class TaskBase(BaseModel):
    title: Title
    notes: str = Field(default="", max_length=10_000)
    project_id: int | None = None
    priority: Priority = Priority.MEDIUM
    status: Status = Status.TODO
    due_date: date | None = None
    recurrence: Recurrence | None = None
    estimate_minutes: int | None = Field(default=None, ge=0, le=100_000)
    assignee_id: int | None = None

    _strip_title = field_validator("title", mode="before")(_strip)


class TaskCreate(TaskBase):
    tags: list[TagName] = Field(default_factory=list)
    subtasks: list[Title] = Field(default_factory=list)

    _normalise_tags = field_validator("tags")(_normalise_tag_list)


class TaskUpdate(BaseModel):
    """All fields optional; ``None`` for nullable fields clears them only when explicitly set."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    project_id: int | None = None
    priority: Priority | None = None
    status: Status | None = None
    due_date: date | None = None
    recurrence: Recurrence | None = None
    estimate_minutes: int | None = Field(default=None, ge=0, le=100_000)
    assignee_id: int | None = None
    tags: list[TagName] | None = None
    position: int | None = None

    _strip_title = field_validator("title", mode="before")(_strip)
    _normalise_tags = field_validator("tags")(_normalise_optional_tag_list)


class TaskRead(ORMModel):
    id: int
    title: str
    notes: str
    project_id: int | None
    project: ProjectRead | None
    priority: Priority
    status: Status
    due_date: date | None
    recurrence: Recurrence | None
    estimate_minutes: int | None
    position: int
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    assignee_id: int | None
    assignee: UserPublic | None
    created_by: UserPublic | None
    comment_count: int = 0
    tags: list[TagRead]
    subtasks: list[SubtaskRead]
    is_overdue: bool


class TaskSort(StrEnum):
    SMART = "smart"
    DUE_DATE = "due_date"
    PRIORITY = "priority"
    CREATED = "created"
    UPDATED = "updated"
    TITLE = "title"
    POSITION = "position"


class TaskFilter(BaseModel):
    """Query parameters accepted by ``GET /api/tasks``."""

    project_id: int | None = None
    inbox: bool = False
    status: list[Status] | None = None
    priority: list[Priority] | None = None
    tag: list[str] | None = None
    search: str | None = Field(default=None, max_length=200)
    due_from: date | None = None
    due_to: date | None = None
    overdue: bool = False
    assignee_id: int | None = None
    unassigned: bool = False
    include_done: bool = True
    sort: TaskSort = TaskSort.SMART
    order: Literal["asc", "desc"] = "asc"
    limit: int | None = Field(default=None, ge=1, le=1000)


class CompleteResult(BaseModel):
    task: TaskRead
    next_task: TaskRead | None = None


class QuickAddRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    dry_run: bool = False


class QuickAddPreview(BaseModel):
    title: str
    project_name: str | None = None
    project_id: int | None = None
    priority: Priority = Priority.MEDIUM
    due_date: date | None = None
    recurrence: Recurrence | None = None
    tags: list[str] = Field(default_factory=list)
    estimate_minutes: int | None = None
    warnings: list[str] = Field(default_factory=list)


class QuickAddResult(BaseModel):
    preview: QuickAddPreview
    task: TaskRead | None = None


class BulkAction(StrEnum):
    COMPLETE = "complete"
    REOPEN = "reopen"
    DELETE = "delete"
    SET_STATUS = "set_status"
    SET_PRIORITY = "set_priority"
    MOVE_TO_PROJECT = "move_to_project"
    SET_DUE_DATE = "set_due_date"
    ADD_TAG = "add_tag"
    ASSIGN = "assign"


class BulkRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    action: BulkAction
    status: Status | None = None
    priority: Priority | None = None
    project_id: int | None = None
    due_date: date | None = None
    tag: TagName | None = None
    assignee_id: int | None = None

    _normalise_tag = field_validator("tag")(_normalise_optional_tag)

    @model_validator(mode="after")
    def _check_payload(self) -> BulkRequest:
        required: dict[BulkAction, str] = {
            BulkAction.SET_STATUS: "status",
            BulkAction.SET_PRIORITY: "priority",
            BulkAction.ADD_TAG: "tag",
        }
        field = required.get(self.action)
        if field and getattr(self, field) is None:
            raise ValueError(f"'{field}' is required for action '{self.action}'")
        return self


class BulkResult(BaseModel):
    affected: int
    tasks: list[TaskRead] = Field(default_factory=list)


class ReorderRequest(BaseModel):
    status: Status
    ordered_ids: list[int] = Field(min_length=1)


# ── Stats ────────────────────────────────────────────────────────────────────


class DayCount(BaseModel):
    day: date
    count: int


class ProjectProgress(BaseModel):
    id: int | None
    name: str
    color: str
    total: int
    done: int


class MemberLoad(BaseModel):
    user: UserPublic | None
    open: int
    overdue: int


class Overview(BaseModel):
    total: int
    open: int
    by_status: dict[Status, int]
    by_priority: dict[Priority, int]
    overdue: int
    due_today: int
    due_this_week: int
    completed_today: int
    completed_last_7_days: int
    completion_rate: float
    completed_series: list[DayCount]
    created_series: list[DayCount]
    projects: list[ProjectProgress]
    members: list[MemberLoad] = Field(default_factory=list)
    streak_days: int


# ── Transfer (export / import) ───────────────────────────────────────────────


class ExportBundle(BaseModel):
    version: int = 2
    exported_at: datetime
    projects: list[ProjectRead]
    tags: list[TagRead]
    tasks: list[TaskRead]


class ImportResult(BaseModel):
    projects: int
    tags: int
    tasks: int
    subtasks: int
    skipped: int = 0
    warnings: list[str] = Field(default_factory=list)


class LegacyImportRequest(BaseModel):
    """Payload format produced by the original CLI app (``planner_data.json``)."""

    tasks: list[dict[str, Any]] = Field(default_factory=list)
    projects: list[dict[str, Any]] = Field(default_factory=list)


class ImportBundle(BaseModel):
    version: int = 2
    projects: list[dict[str, Any]] = Field(default_factory=list)
    tags: list[dict[str, Any]] = Field(default_factory=list)
    tasks: list[dict[str, Any]] = Field(default_factory=list)


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
    database: str

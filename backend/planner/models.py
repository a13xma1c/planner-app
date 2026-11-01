"""SQLAlchemy ORM models."""

from __future__ import annotations

import enum
from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Priority(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class Status(enum.StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class Recurrence(enum.StrEnum):
    DAILY = "daily"
    WEEKDAYS = "weekdays"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


PRIORITY_RANK: dict[Priority, int] = {
    Priority.URGENT: 0,
    Priority.HIGH: 1,
    Priority.MEDIUM: 2,
    Priority.LOW: 3,
}


def str_enum(enum_cls: type[enum.StrEnum], length: int) -> Enum:
    """A portable VARCHAR-backed enum column that stores the enum *values* (``"low"``)."""
    return Enum(
        enum_cls,
        native_enum=False,
        length=length,
        values_callable=lambda e: [m.value for m in e],
        name=enum_cls.__name__.lower(),
    )


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )


task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("name", name="uq_projects_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#6366f1", nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    tasks: Mapped[list[Task]] = relationship(back_populates="project", passive_deletes=True)


class Tag(TimestampMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("name", name="uq_tags_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#64748b", nullable=False)

    tasks: Mapped[list[Task]] = relationship(
        secondary=task_tags, back_populates="tags", passive_deletes=True
    )


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    priority: Mapped[Priority] = mapped_column(
        str_enum(Priority, 10), default=Priority.MEDIUM, nullable=False
    )
    status: Mapped[Status] = mapped_column(
        str_enum(Status, 12), default=Status.TODO, nullable=False, index=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    recurrence: Mapped[Recurrence | None] = mapped_column(str_enum(Recurrence, 10), nullable=True)
    estimate_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project | None] = relationship(back_populates="tasks", lazy="joined")
    tags: Mapped[list[Tag]] = relationship(
        secondary=task_tags, back_populates="tasks", lazy="selectin", order_by="Tag.name"
    )
    subtasks: Mapped[list[Subtask]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Subtask.position, Subtask.id",
    )

    @property
    def is_overdue(self) -> bool:
        return (
            self.due_date is not None
            and self.status != Status.DONE
            and self.due_date < date.today()
        )


class Subtask(Base):
    __tablename__ = "subtasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    task: Mapped[Task] = relationship(back_populates="subtasks")

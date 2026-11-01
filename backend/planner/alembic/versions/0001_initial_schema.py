"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-01 11:06:52.674357
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_projects_name"),
    )
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_tags_name"),
    )
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column(
            "priority",
            sa.Enum(
                "low", "medium", "high", "urgent", name="priority", native_enum=False, length=10
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("todo", "in_progress", "done", name="status", native_enum=False, length=12),
            nullable=False,
        ),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "recurrence",
            sa.Enum(
                "daily",
                "weekdays",
                "weekly",
                "biweekly",
                "monthly",
                "yearly",
                name="recurrence",
                native_enum=False,
                length=10,
            ),
            nullable=True,
        ),
        sa.Column("estimate_minutes", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_tasks_due_date"), ["due_date"], unique=False)
        batch_op.create_index(batch_op.f("ix_tasks_project_id"), ["project_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_tasks_status"), ["status"], unique=False)

    op.create_table(
        "subtasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("is_done", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("subtasks", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_subtasks_task_id"), ["task_id"], unique=False)

    op.create_table(
        "task_tags",
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("task_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("task_tags")
    with op.batch_alter_table("subtasks", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_subtasks_task_id"))

    op.drop_table("subtasks")
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_tasks_status"))
        batch_op.drop_index(batch_op.f("ix_tasks_project_id"))
        batch_op.drop_index(batch_op.f("ix_tasks_due_date"))

    op.drop_table("tasks")
    op.drop_table("tags")
    op.drop_table("projects")

"""users, workspaces, sharing

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-01 14:09:03.234917
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op


revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_sessions_token_hash"), ["token_hash"], unique=True)
        batch_op.create_index(batch_op.f("ix_sessions_user_id"), ["user_id"], unique=False)

    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_personal", sa.Boolean(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "invitations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column(
            "role",
            sa.Enum("owner", "editor", "viewer", name="role", native_enum=False, length=10),
            nullable=False,
        ),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("use_count", sa.Integer(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("invitations", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_invitations_token"), ["token"], unique=True)
        batch_op.create_index(
            batch_op.f("ix_invitations_workspace_id"), ["workspace_id"], unique=False
        )

    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("owner", "editor", "viewer", name="role", native_enum=False, length=10),
            nullable=False,
        ),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_memberships"),
    )
    with op.batch_alter_table("memberships", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_memberships_user_id"), ["user_id"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_memberships_workspace_id"), ["workspace_id"], unique=False
        )

    op.create_table(
        "comments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_comments_task_id"), ["task_id"], unique=False)

    # ── Scope existing data to workspaces ──────────────────────────────────
    # 1. add the new columns as nullable
    with op.batch_alter_table("projects", schema=None) as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.Integer(), nullable=True))
    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.Integer(), nullable=True))
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("assignee_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("created_by_id", sa.Integer(), nullable=True))

    # 2. adopt pre-existing (single-user) rows into a workspace that the first
    #    registered user will own (see services.auth.register)
    _adopt_orphans()

    # 3. tighten constraints now that every row has a workspace
    with op.batch_alter_table("projects", schema=None) as batch_op:
        batch_op.alter_column("workspace_id", existing_type=sa.Integer(), nullable=False)
        batch_op.drop_constraint("uq_projects_name", type_="unique")
        batch_op.create_index(
            batch_op.f("ix_projects_workspace_id"), ["workspace_id"], unique=False
        )
        batch_op.create_unique_constraint("uq_projects_workspace_name", ["workspace_id", "name"])
        batch_op.create_foreign_key(
            "fk_projects_workspace", "workspaces", ["workspace_id"], ["id"], ondelete="CASCADE"
        )

    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.alter_column("workspace_id", existing_type=sa.Integer(), nullable=False)
        batch_op.drop_constraint("uq_tags_name", type_="unique")
        batch_op.create_index(batch_op.f("ix_tags_workspace_id"), ["workspace_id"], unique=False)
        batch_op.create_unique_constraint("uq_tags_workspace_name", ["workspace_id", "name"])
        batch_op.create_foreign_key(
            "fk_tags_workspace", "workspaces", ["workspace_id"], ["id"], ondelete="CASCADE"
        )

    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.alter_column("workspace_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_index(batch_op.f("ix_tasks_assignee_id"), ["assignee_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_tasks_workspace_id"), ["workspace_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_tasks_assignee", "users", ["assignee_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_foreign_key(
            "fk_tasks_created_by", "users", ["created_by_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_foreign_key(
            "fk_tasks_workspace", "workspaces", ["workspace_id"], ["id"], ondelete="CASCADE"
        )


LEGACY_WORKSPACE_NAME = "My planner"


def _adopt_orphans() -> None:
    bind = op.get_bind()
    orphans = 0
    for table in ("projects", "tags", "tasks"):
        orphans += bind.execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE workspace_id IS NULL")
        ).scalar_one()
    if not orphans:
        return
    now = datetime.now(UTC).replace(tzinfo=None)
    result = bind.execute(
        sa.text(
            "INSERT INTO workspaces (name, is_personal, created_by_id, created_at, updated_at) "
            "VALUES (:name, 1, NULL, :now, :now)"
        ),
        {"name": LEGACY_WORKSPACE_NAME, "now": now},
    )
    workspace_id = result.lastrowid
    for table in ("projects", "tags", "tasks"):
        bind.execute(
            sa.text(f"UPDATE {table} SET workspace_id = :wid WHERE workspace_id IS NULL"),
            {"wid": workspace_id},
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.drop_constraint("fk_tasks_workspace", type_="foreignkey")
        batch_op.drop_constraint("fk_tasks_created_by", type_="foreignkey")
        batch_op.drop_constraint("fk_tasks_assignee", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_tasks_workspace_id"))
        batch_op.drop_index(batch_op.f("ix_tasks_assignee_id"))
        batch_op.drop_column("created_by_id")
        batch_op.drop_column("assignee_id")
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.drop_constraint("fk_tags_workspace", type_="foreignkey")
        batch_op.drop_constraint("uq_tags_workspace_name", type_="unique")
        batch_op.drop_index(batch_op.f("ix_tags_workspace_id"))
        batch_op.create_unique_constraint("uq_tags_name", ["name"])
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("projects", schema=None) as batch_op:
        batch_op.drop_constraint("fk_projects_workspace", type_="foreignkey")
        batch_op.drop_constraint("uq_projects_workspace_name", type_="unique")
        batch_op.drop_index(batch_op.f("ix_projects_workspace_id"))
        batch_op.create_unique_constraint("uq_projects_name", ["name"])
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_comments_task_id"))

    op.drop_table("comments")
    with op.batch_alter_table("memberships", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_memberships_workspace_id"))
        batch_op.drop_index(batch_op.f("ix_memberships_user_id"))

    op.drop_table("memberships")
    with op.batch_alter_table("invitations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_invitations_workspace_id"))
        batch_op.drop_index(batch_op.f("ix_invitations_token"))

    op.drop_table("invitations")
    op.drop_table("workspaces")
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sessions_user_id"))
        batch_op.drop_index(batch_op.f("ix_sessions_token_hash"))

    op.drop_table("sessions")
    op.drop_table("users")

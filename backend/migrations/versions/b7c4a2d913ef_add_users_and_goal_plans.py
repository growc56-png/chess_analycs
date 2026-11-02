"""add user accounts and personalized training data

Revision ID: b7c4a2d913ef
Revises: f0e3310eff99
Create Date: 2026-11-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c4a2d913ef"
down_revision: Union[str, Sequence[str], None] = "f0e3310eff99"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("username", sa.String(length=24), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("current_elo", sa.Integer(), nullable=True),
        sa.Column("target_elo", sa.Integer(), nullable=True),
        sa.Column("goal_days", sa.Integer(), nullable=True),
        sa.Column("daily_minutes", sa.Integer(), nullable=True),
        sa.Column("goal_started_on", sa.Date(), nullable=True),
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "auth_sessions",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"], unique=False)
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"], unique=False)

    op.create_table(
        "user_completed",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day_num", sa.Integer(), primary_key=True),
        sa.Column("completed_at", sa.Text(), nullable=True),
    )
    op.create_table(
        "user_notes",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day_num", sa.Integer(), primary_key=True),
        sa.Column("text", sa.Text(), nullable=True),
    )
    op.create_table(
        "user_activity",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day_date", sa.String(length=10), primary_key=True),
    )
    op.create_table(
        "user_streak_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("result", sa.String(length=10), nullable=False),
    )
    op.create_index("ix_user_streak_results_user_id", "user_streak_results", ["user_id"], unique=False)
    op.create_index("ix_user_streak_results_date", "user_streak_results", ["date"], unique=False)

    op.create_table(
        "user_mate_records",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("mate_id", sa.String(length=80), primary_key=True),
        sa.Column("best_time", sa.Float(), nullable=True),
    )

    op.add_column(
        "bot_games",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_bot_games_user_id", "bot_games", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_bot_games_user_id", table_name="bot_games")
    op.drop_column("bot_games", "user_id")
    op.drop_table("user_mate_records")
    op.drop_index("ix_user_streak_results_date", table_name="user_streak_results")
    op.drop_index("ix_user_streak_results_user_id", table_name="user_streak_results")
    op.drop_table("user_streak_results")
    op.drop_table("user_activity")
    op.drop_table("user_notes")
    op.drop_table("user_completed")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

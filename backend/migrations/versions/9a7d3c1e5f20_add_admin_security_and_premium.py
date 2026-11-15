"""add admin security and premium subscriptions

Revision ID: 9a7d3c1e5f20
Revises: f0e3310eff99
Create Date: 2026-11-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9a7d3c1e5f20"
down_revision: Union[str, Sequence[str], None] = "b7c4a2d913ef"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("admin_password_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("premium_expires_at", sa.DateTime(timezone=True), nullable=True))
    # One-time global sign-out: revoke every pre-security session without deleting accounts or games.
    op.execute(sa.text("DELETE FROM auth_sessions"))


def downgrade() -> None:
    op.drop_column("users", "premium_expires_at")
    op.drop_column("users", "admin_password_hash")
    op.drop_column("users", "is_admin")

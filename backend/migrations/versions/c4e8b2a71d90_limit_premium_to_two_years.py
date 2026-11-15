"""limit premium subscriptions to two years and repair legacy timestamps

Revision ID: c4e8b2a71d90
Revises: 9a7d3c1e5f20
Create Date: 2026-11-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c4e8b2a71d90"
down_revision: Union[str, Sequence[str], None] = "9a7d3c1e5f20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Clamp active Premium expirations to at most two years from now.
    # PostgreSQL performs the comparison and update; psycopg never loads a
    # legacy year-10000 timestamp into Python.
    op.execute(sa.text(
        "UPDATE users "
        "SET premium_expires_at = CURRENT_TIMESTAMP + INTERVAL '730 days' "
        "WHERE premium_expires_at > CURRENT_TIMESTAMP + INTERVAL '730 days'"
    ))


def downgrade() -> None:
    # Do not restore unlimited or out-of-range subscription dates.
    pass

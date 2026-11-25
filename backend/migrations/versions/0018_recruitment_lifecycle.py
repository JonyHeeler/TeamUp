"""add recruitment lifecycle fields published_at, expires_at, duration_days

Revision ID: 0018_recruitment_lifecycle
Revises: 0017_team_management
Create Date: 2026-11-25 00:00:00
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.mysql import DATETIME

revision = "0018_recruitment_lifecycle"
down_revision = "0017_team_management"
branch_labels = None
depends_on = None

utc_type = DATETIME(fsp=6)


def upgrade() -> None:
    op.add_column("recruitments", sa.Column("published_at", utc_type, nullable=True))
    op.add_column("recruitments", sa.Column("expires_at", utc_type, nullable=True))
    op.add_column("recruitments", sa.Column("duration_days", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "ck_recruitment_duration_days",
        "recruitments",
        "duration_days IS NULL OR duration_days IN (7, 14, 30)",
    )
    op.create_index("ix_recruitment_expires_at", "recruitments", ["expires_at"])

    # Backfill currently published recruitments of active teams with default 14-day UTC validity.
    # Unpublished recruitments and disbanded teams remain NULL and are never auto-republished.
    now_utc = datetime.now(UTC).replace(tzinfo=None)
    expires_utc = now_utc + timedelta(days=14)
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE recruitments r "
            "JOIN teams t ON t.id = r.team_id "
            "SET r.published_at = :pub, r.expires_at = :exp, r.duration_days = 14 "
            "WHERE r.is_published = 1 AND t.status = 'active'"
        ),
        {"pub": now_utc, "exp": expires_utc},
    )


def downgrade() -> None:
    # Note: downgrading removes recruitment lifecycle timestamps and duration metadata.
    op.drop_index("ix_recruitment_expires_at", table_name="recruitments")
    op.drop_constraint("ck_recruitment_duration_days", "recruitments", type_="check")
    op.drop_column("recruitments", "duration_days")
    op.drop_column("recruitments", "expires_at")
    op.drop_column("recruitments", "published_at")

"""add response_message to team_invitations for formal team management

Revision ID: 0017_team_management
Revises: 0016_team_membership
Create Date: 2026-11-25 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017_team_management"
down_revision = "0016_team_membership"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "team_invitations",
        sa.Column("response_message", sa.String(length=300), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("team_invitations", "response_message")

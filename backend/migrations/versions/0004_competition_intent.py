import sqlalchemy as sa
from alembic import op

revision = "0004_competition_intent"
down_revision = "0003_profile_and_team_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("competition_intent", sa.String(500), nullable=True))
    op.add_column(
        "profiles",
        sa.Column("show_competition_intent", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("profiles", "show_competition_intent")
    op.drop_column("profiles", "competition_intent")

import sqlalchemy as sa
from alembic import op

revision = "0010_recruitment_visibility"
down_revision = "0009_intent_message"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recruitments",
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("recruitments", "is_published")

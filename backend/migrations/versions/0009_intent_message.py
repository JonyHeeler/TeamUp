import sqlalchemy as sa
from alembic import op

revision = "0009_intent_message"
down_revision = "0008_competition_catalog_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("intents", sa.Column("message", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("intents", "message")

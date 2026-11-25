import sqlalchemy as sa
from alembic import op

revision = "0012_intent_response_message"
down_revision = "0011_account_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("intents", sa.Column("response_message", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("intents", "response_message")

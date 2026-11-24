import sqlalchemy as sa
from alembic import op

revision = "0005_profile_projects"
down_revision = "0004_competition_intent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("projects", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "projects")

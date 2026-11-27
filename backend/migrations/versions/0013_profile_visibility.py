import sqlalchemy as sa
from alembic import op

revision = "0013_profile_visibility"
down_revision = "0012_recruitment_requirements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Default existing profiles and QQ to public."""
    op.add_column("profiles", sa.Column("listed", sa.Boolean(), nullable=False, server_default="1"))
    op.add_column(
        "profiles", sa.Column("show_qq", sa.Boolean(), nullable=False, server_default="1")
    )


def downgrade() -> None:
    """Remove profile visibility choices."""
    op.drop_column("profiles", "show_qq")
    op.drop_column("profiles", "listed")

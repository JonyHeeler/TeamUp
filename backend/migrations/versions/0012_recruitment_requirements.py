"""Allow independent requirements and optional free-text openings."""

import sqlalchemy as sa
from alembic import op

revision = "0012_recruitment_requirements"
down_revision = "0011_account_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Preserve existing counts as text while removing slot coupling."""
    op.drop_constraint("ck_recruitment_requirement_count", "recruitments", type_="check")
    op.drop_constraint("ck_recruitment_openings", "recruitments", type_="check")
    op.alter_column(
        "recruitments", "openings", existing_type=sa.Integer(), type_=sa.String(40), nullable=True
    )


def downgrade() -> None:
    """Reject downgrade if new values cannot be represented safely."""
    connection = op.get_bind()
    invalid = connection.execute(
        sa.text(
            "SELECT COUNT(*) FROM recruitments WHERE openings IS NULL OR openings NOT REGEXP '^[1-9][0-9]*$' OR CAST(openings AS UNSIGNED) > 2147483647 OR (requirements IS NOT NULL AND JSON_LENGTH(requirements) != CAST(openings AS UNSIGNED))"
        )
    ).scalar_one()
    if invalid:
        raise RuntimeError(
            "Recruitments contain openings or requirements incompatible with the previous schema"
        )
    op.alter_column(
        "recruitments", "openings", existing_type=sa.String(40), type_=sa.Integer(), nullable=False
    )
    op.create_check_constraint("ck_recruitment_openings", "recruitments", "openings > 0")
    op.create_check_constraint(
        "ck_recruitment_requirement_count",
        "recruitments",
        "requirements IS NULL OR (JSON_TYPE(requirements) = 'ARRAY' AND JSON_LENGTH(requirements) = openings)",
    )

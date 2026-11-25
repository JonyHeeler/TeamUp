import sqlalchemy as sa
from alembic import op

revision = "0015_decouple_openings"
down_revision = "0014_intent_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_recruitment_requirement_count", "recruitments", type_="check")
    op.drop_constraint("ck_recruitment_openings", "recruitments", type_="check")
    op.alter_column(
        "recruitments",
        "openings",
        existing_type=sa.Integer(),
        type_=sa.String(40),
        existing_nullable=False,
        nullable=True,
    )
    op.create_check_constraint(
        "ck_recruitment_requirements_array",
        "recruitments",
        "requirements IS NULL OR JSON_TYPE(requirements) = 'ARRAY'",
    )


def downgrade() -> None:
    # Free-text or empty openings and decoupled requirement counts cannot be losslessly converted
    # back to positive integers. Fail explicitly rather than fabricating placeholder counts.
    conn = op.get_bind()
    irreversible = conn.execute(
        sa.text(
            """
            SELECT COUNT(*) FROM recruitments
            WHERE openings IS NULL
               OR openings NOT REGEXP '^[1-9][0-9]*$'
               OR (
                   requirements IS NOT NULL
                   AND JSON_LENGTH(requirements) <> CAST(openings AS UNSIGNED)
               )
            """
        )
    ).scalar()
    if irreversible:
        raise RuntimeError(
            "Cannot losslessly downgrade 0015_decouple_openings: "
            "existing recruitments contain free-text/empty openings or decoupled requirement counts."
        )

    op.drop_constraint("ck_recruitment_requirements_array", "recruitments", type_="check")
    op.alter_column(
        "recruitments",
        "openings",
        existing_type=sa.String(40),
        type_=sa.Integer(),
        existing_nullable=True,
        nullable=False,
    )
    op.create_check_constraint("ck_recruitment_openings", "recruitments", "openings > 0")
    op.create_check_constraint(
        "ck_recruitment_requirement_count",
        "recruitments",
        "requirements IS NULL OR (JSON_TYPE(requirements) = 'ARRAY' AND JSON_LENGTH(requirements) = openings)",
    )

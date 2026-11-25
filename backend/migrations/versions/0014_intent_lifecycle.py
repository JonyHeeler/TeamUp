import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0014_intent_lifecycle"
down_revision = "0013_personal_intent"
branch_labels = None
depends_on = None

utc = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
relation_key = sa.String(76).with_variant(
    mysql.VARCHAR(76, charset="ascii", collation="ascii_bin"), "mysql"
)


def upgrade() -> None:
    op.add_column("intents", sa.Column("expires_at", utc, nullable=True))
    op.add_column("intents", sa.Column("active_relation_key", relation_key, nullable=True))

    # Backfill expires_at strictly from real created_at / responded_at without extending expired rows.
    # Any anomalous non-pending row missing responded_at is marked expired at created_at so it never
    # receives an unintended 7-day QQ authorization.
    op.execute(
        sa.text(
            """
            UPDATE intents
            SET expires_at = CASE
                WHEN status = 'pending' THEN DATE_ADD(created_at, INTERVAL 7 DAY)
                WHEN responded_at IS NOT NULL THEN DATE_ADD(responded_at, INTERVAL 7 DAY)
                ELSE created_at
            END
            """
        )
    )

    # Backfill active_relation_key only for records whose 7-day window is still active.
    op.execute(
        sa.text(
            """
            UPDATE intents
            SET active_relation_key = CASE
                WHEN expires_at > UTC_TIMESTAMP(6) AND kind = 'personal'
                    THEN CONCAT('p:', personal_pair_key)
                WHEN expires_at > UTC_TIMESTAMP(6) AND kind <> 'personal'
                    THEN CONCAT('r:', recruitment_id, ':', candidate_id)
                ELSE NULL
            END
            """
        )
    )

    op.alter_column("intents", "expires_at", existing_type=utc, nullable=False)
    op.create_index(
        "ix_intent_recruitment_candidate", "intents", ["recruitment_id", "candidate_id"]
    )
    op.drop_constraint("uq_intent_recruitment_candidate", "intents", type_="unique")
    op.drop_constraint("uq_intent_personal_pair", "intents", type_="unique")
    op.create_unique_constraint("uq_intent_active_relation", "intents", ["active_relation_key"])
    op.create_index("ix_intent_expires_at", "intents", ["expires_at"])


def downgrade() -> None:
    # Note: Downgrading assumes no multi-round historical duplicates exist for the same relation.
    # If multi-round records already exist in production, re-creating the legacy unique constraints
    # will fail until duplicates are archived or resolved manually.
    op.drop_index("ix_intent_expires_at", table_name="intents")
    op.drop_constraint("uq_intent_active_relation", "intents", type_="unique")
    op.create_unique_constraint(
        "uq_intent_recruitment_candidate", "intents", ["recruitment_id", "candidate_id"]
    )
    op.drop_index("ix_intent_recruitment_candidate", table_name="intents")
    op.create_unique_constraint("uq_intent_personal_pair", "intents", ["personal_pair_key"])
    op.drop_column("intents", "active_relation_key")
    op.drop_column("intents", "expires_at")

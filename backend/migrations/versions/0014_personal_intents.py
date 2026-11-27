import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0014_personal_intents"
down_revision = "0013_profile_visibility"
branch_labels = None
depends_on = None

uuid = mysql.CHAR(36, charset="ascii", collation="ascii_bin")
team_kind = mysql.ENUM("apply", "invite")
all_kinds = mysql.ENUM("apply", "invite", "personal")


def upgrade() -> None:
    """Extend existing intents with personal targets and response notes."""
    op.alter_column(
        "intents", "kind", existing_type=team_kind, type_=all_kinds, existing_nullable=False
    )
    op.alter_column("intents", "recruitment_id", existing_type=uuid, nullable=True)
    op.add_column("intents", sa.Column("personal_sender_id", uuid))
    op.add_column("intents", sa.Column("personal_pair", sa.String(73)))
    op.add_column("intents", sa.Column("response_message", sa.String(300)))
    op.create_foreign_key(
        "fk_intent_personal_sender", "intents", "users", ["personal_sender_id"], ["id"]
    )
    op.create_index(
        "ix_intent_personal_sender_created", "intents", ["personal_sender_id", "created_at"]
    )
    op.create_unique_constraint("uq_intent_personal_pair", "intents", ["personal_pair"])
    op.create_check_constraint(
        "ck_intent_target",
        "intents",
        "(kind = 'personal' AND recruitment_id IS NULL AND personal_sender_id IS NOT NULL "
        "AND personal_pair IS NOT NULL AND personal_sender_id <> candidate_id) OR "
        "(kind <> 'personal' AND recruitment_id IS NOT NULL AND personal_sender_id IS NULL "
        "AND personal_pair IS NULL)",
    )


def downgrade() -> None:
    """Remove the new fields when the previous schema can represent every intent."""
    incompatible = op.get_bind().scalar(
        sa.text(
            "SELECT 1 FROM intents WHERE kind = 'personal' OR response_message IS NOT NULL LIMIT 1"
        )
    )
    if incompatible:
        raise RuntimeError(
            "The previous schema cannot represent personal intents or response notes"
        )
    op.drop_constraint("ck_intent_target", "intents", type_="check")
    op.drop_constraint("uq_intent_personal_pair", "intents", type_="unique")
    op.drop_constraint("fk_intent_personal_sender", "intents", type_="foreignkey")
    op.drop_index("ix_intent_personal_sender_created", table_name="intents")
    op.drop_column("intents", "response_message")
    op.drop_column("intents", "personal_pair")
    op.drop_column("intents", "personal_sender_id")
    op.drop_constraint("intents_ibfk_1", "intents", type_="foreignkey")
    op.alter_column("intents", "recruitment_id", existing_type=uuid, nullable=False)
    op.create_foreign_key("intents_ibfk_1", "intents", "recruitments", ["recruitment_id"], ["id"])
    op.alter_column(
        "intents", "kind", existing_type=all_kinds, type_=team_kind, existing_nullable=False
    )

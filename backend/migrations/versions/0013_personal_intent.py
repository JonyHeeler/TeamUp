import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0013_personal_intent"
down_revision = "0012_intent_response_message"
branch_labels = None
depends_on = None

uuid = sa.String(36).with_variant(mysql.CHAR(36, charset="ascii", collation="ascii_bin"), "mysql")
pair_key = sa.String(73).with_variant(
    mysql.VARCHAR(73, charset="ascii", collation="ascii_bin"), "mysql"
)


def upgrade() -> None:
    op.alter_column(
        "intents",
        "kind",
        existing_type=sa.Enum("apply", "invite", name="intent_kind"),
        type_=sa.Enum("apply", "invite", "personal", name="intent_kind"),
        existing_nullable=False,
    )
    op.alter_column(
        "intents",
        "recruitment_id",
        existing_type=uuid,
        nullable=True,
    )
    op.add_column("intents", sa.Column("sender_id", uuid, nullable=True))
    op.add_column("intents", sa.Column("recipient_id", uuid, nullable=True))
    op.add_column("intents", sa.Column("personal_pair_key", pair_key, nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE intents i
            JOIN recruitments r ON i.recruitment_id = r.id
            SET
                i.sender_id = CASE WHEN i.kind = 'apply' THEN i.candidate_id ELSE r.owner_id END,
                i.recipient_id = CASE WHEN i.kind = 'apply' THEN r.owner_id ELSE i.candidate_id END
            """
        )
    )

    op.alter_column("intents", "sender_id", existing_type=uuid, nullable=False)
    op.alter_column("intents", "recipient_id", existing_type=uuid, nullable=False)
    op.create_foreign_key("fk_intents_sender_id_users", "intents", "users", ["sender_id"], ["id"])
    op.create_foreign_key(
        "fk_intents_recipient_id_users", "intents", "users", ["recipient_id"], ["id"]
    )
    op.create_unique_constraint("uq_intent_personal_pair", "intents", ["personal_pair_key"])
    op.create_index("ix_intent_sender_created", "intents", ["sender_id", "created_at"])
    op.create_index("ix_intent_recipient_created", "intents", ["recipient_id", "created_at"])
    op.create_check_constraint(
        "ck_intent_kind_recruitment",
        "intents",
        "(kind = 'personal' AND recruitment_id IS NULL AND personal_pair_key IS NOT NULL) "
        "OR (kind <> 'personal' AND recruitment_id IS NOT NULL AND personal_pair_key IS NULL)",
    )
    op.create_check_constraint(
        "ck_intent_distinct_participants",
        "intents",
        "sender_id <> recipient_id",
    )


def downgrade() -> None:
    op.drop_constraint("ck_intent_distinct_participants", "intents", type_="check")
    op.drop_constraint("ck_intent_kind_recruitment", "intents", type_="check")
    op.drop_constraint("fk_intents_recipient_id_users", "intents", type_="foreignkey")
    op.drop_constraint("fk_intents_sender_id_users", "intents", type_="foreignkey")
    op.drop_index("ix_intent_recipient_created", table_name="intents")
    op.drop_index("ix_intent_sender_created", table_name="intents")
    op.drop_constraint("uq_intent_personal_pair", "intents", type_="unique")
    op.execute(sa.text("DELETE FROM intents WHERE kind = 'personal' OR recruitment_id IS NULL"))
    op.drop_column("intents", "personal_pair_key")
    op.drop_column("intents", "recipient_id")
    op.drop_column("intents", "sender_id")

    # MySQL 8.0 rejects modifying a column's nullability (NULL -> NOT NULL) while it is referenced
    # by a foreign key (Error 1832). Inspect actual FK metadata rather than hardcoding constraint
    # names, drop the FK(s) on recruitment_id, restore NOT NULL, then recreate them verbatim.
    inspector = sa.inspect(op.get_bind())
    recruitment_fks = [
        fk
        for fk in inspector.get_foreign_keys("intents")
        if fk.get("constrained_columns") == ["recruitment_id"] and fk.get("name")
    ]
    for fk in recruitment_fks:
        op.drop_constraint(fk["name"], "intents", type_="foreignkey")
    op.alter_column(
        "intents",
        "recruitment_id",
        existing_type=uuid,
        nullable=False,
    )
    for fk in recruitment_fks:
        options = fk.get("options") or {}
        op.create_foreign_key(
            fk["name"],
            "intents",
            fk["referred_table"],
            fk["constrained_columns"],
            fk["referred_columns"],
            ondelete=options.get("ondelete"),
            onupdate=options.get("onupdate"),
        )
    op.alter_column(
        "intents",
        "kind",
        existing_type=sa.Enum("apply", "invite", "personal", name="intent_kind"),
        type_=sa.Enum("apply", "invite", name="intent_kind"),
        existing_nullable=False,
    )

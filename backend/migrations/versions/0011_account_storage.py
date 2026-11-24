import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0011_account_storage"
down_revision = "0010_recruitment_visibility"
branch_labels = None
depends_on = None

uuid = sa.String(36).with_variant(mysql.CHAR(36, charset="ascii", collation="ascii_bin"), "mysql")
digest = sa.String(64).with_variant(mysql.CHAR(64, charset="ascii", collation="ascii_bin"), "mysql")
student_id = sa.String(64).with_variant(mysql.VARCHAR(64, charset="ascii", collation="ascii_bin"), "mysql")
utc = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
options = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


def upgrade() -> None:
    op.create_table(
        "student_accounts",
        sa.Column("user_id", uuid, sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("student_id", student_id, nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("status", sa.Enum("active", "suspended", name="account_status"), nullable=False),
        sa.Column("verified_at", utc, nullable=False),
        **options,
    )
    op.create_table(
        "account_challenges",
        sa.Column("token_hash", digest, primary_key=True),
        sa.Column("student_id", student_id, nullable=False),
        sa.Column("purpose", sa.Enum("activate", "reset", name="account_challenge_purpose"), nullable=False),
        sa.Column("expires_at", utc, nullable=False),
        sa.Column("consumed_at", utc),
        **options,
    )
    op.create_index("ix_account_challenge_student_purpose", "account_challenges", ["student_id", "purpose"])
    op.create_table(
        "account_sessions",
        sa.Column("token_hash", digest, primary_key=True),
        sa.Column("user_id", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", utc, nullable=False),
        sa.Column("idle_expires_at", utc, nullable=False),
        sa.Column("expires_at", utc, nullable=False),
        sa.Column("revoked_at", utc),
        **options,
    )
    op.create_index("ix_account_session_user", "account_sessions", ["user_id"])
    op.create_table(
        "account_audit_events",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("user_id", uuid, sa.ForeignKey("users.id")),
        sa.Column("event", sa.String(80), nullable=False),
        sa.Column("created_at", utc, nullable=False),
        **options,
    )
    op.create_table(
        "account_rate_limits",
        sa.Column("key_hash", digest, primary_key=True),
        sa.Column("expires_at", utc, nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        **options,
    )


def downgrade() -> None:
    op.drop_table("account_rate_limits")
    op.drop_table("account_audit_events")
    op.drop_table("account_sessions")
    op.drop_table("account_challenges")
    op.drop_table("student_accounts")

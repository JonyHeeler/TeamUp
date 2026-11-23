import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0002_profile_evidence"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid_type = mysql.CHAR(36, charset="ascii", collation="ascii_bin")
    op.create_table(
        "profile_evidence",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("user_id", uuid_type, sa.ForeignKey("profiles.user_id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("image", mysql.MEDIUMBLOB(), nullable=False),
        sa.CheckConstraint(
            "OCTET_LENGTH(image) BETWEEN 1 AND 1000000", name="ck_profile_evidence_size"
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(
        "ix_profile_evidence_user_position", "profile_evidence", ["user_id", "position"]
    )


def downgrade() -> None:
    op.drop_table("profile_evidence")

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0016_team_membership"
down_revision = "0015_decouple_openings"
branch_labels = None
depends_on = None

uuid = sa.String(36).with_variant(mysql.CHAR(36, charset="ascii", collation="ascii_bin"), "mysql")
utc = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
team_num = mysql.CHAR(11, charset="ascii", collation="ascii_bin")
active_inv_key = sa.String(73).with_variant(
    mysql.VARCHAR(73, charset="ascii", collation="ascii_bin"), "mysql"
)
options = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


def upgrade() -> None:
    op.create_table(
        "teams",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "captain_id",
            uuid,
            sa.ForeignKey("users.id", name="fk_teams_captain_id_users"),
            nullable=False,
        ),
        sa.Column("competition", sa.String(80), nullable=False),
        sa.Column("team_name", sa.String(80), nullable=False),
        sa.Column("team_number", team_num, nullable=False),
        sa.Column("description", sa.String(1200), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "disbanded", name="team_status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("created_at", utc, nullable=False),
        sa.UniqueConstraint("team_number", name="uq_team_number"),
        **options,
    )
    op.create_index("ix_team_captain_created", "teams", ["captain_id", "created_at"])

    op.create_table(
        "team_members",
        sa.Column(
            "team_id",
            uuid,
            sa.ForeignKey("teams.id", name="fk_team_members_team_id_teams"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            uuid,
            sa.ForeignKey("users.id", name="fk_team_members_user_id_users"),
            primary_key=True,
        ),
        sa.Column(
            "role",
            sa.Enum("captain", "member", name="team_member_role"),
            nullable=False,
        ),
        sa.Column("joined_at", utc, nullable=False),
        **options,
    )
    op.create_index("ix_team_member_user_joined", "team_members", ["user_id", "joined_at"])

    op.create_table(
        "team_invitations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "team_id",
            uuid,
            sa.ForeignKey("teams.id", name="fk_team_invitations_team_id_teams"),
            nullable=False,
        ),
        sa.Column(
            "inviter_id",
            uuid,
            sa.ForeignKey("users.id", name="fk_team_invitations_inviter_id_users"),
            nullable=False,
        ),
        sa.Column(
            "invitee_id",
            uuid,
            sa.ForeignKey("users.id", name="fk_team_invitations_invitee_id_users"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "accepted", "declined", name="team_invitation_status"),
            nullable=False,
        ),
        sa.Column("message", sa.String(300), nullable=True),
        sa.Column("created_at", utc, nullable=False),
        sa.Column("responded_at", utc, nullable=True),
        sa.Column("expires_at", utc, nullable=False),
        sa.Column("active_invite_key", active_inv_key, nullable=True),
        sa.UniqueConstraint("active_invite_key", name="uq_team_invitation_active"),
        sa.CheckConstraint("inviter_id <> invitee_id", name="ck_team_inv_distinct_users"),
        sa.CheckConstraint(
            "(status = 'pending' AND responded_at IS NULL) "
            "OR (status <> 'pending' AND responded_at IS NOT NULL)",
            name="ck_team_inv_response_time",
        ),
        **options,
    )
    op.create_index("ix_team_inv_team_created", "team_invitations", ["team_id", "created_at"])
    op.create_index(
        "ix_team_inv_invitee_created", "team_invitations", ["invitee_id", "created_at"]
    )
    op.create_index(
        "ix_team_inv_inviter_created", "team_invitations", ["inviter_id", "created_at"]
    )
    op.create_index("ix_team_inv_expires_at", "team_invitations", ["expires_at"])

    # Deterministically map every historical Recruitment 1-to-1 to a Team
    # (team.id == recruitment.id) and register ONLY the historical owner
    # as captain. Never infer members from historical intents.
    op.execute(
        sa.text(
            """
            INSERT INTO teams (
                id, captain_id, competition, team_name, team_number, description, status, created_at
            )
            SELECT
                id, owner_id, competition, team_name, team_number, task, 'active', created_at
            FROM recruitments
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO team_members (team_id, user_id, role, joined_at)
            SELECT id, owner_id, 'captain', created_at
            FROM recruitments
            """
        )
    )

    op.add_column("recruitments", sa.Column("team_id", uuid, nullable=True))
    op.execute(sa.text("UPDATE recruitments SET team_id = id"))
    op.alter_column("recruitments", "team_id", existing_type=uuid, nullable=False)
    op.create_unique_constraint("uq_recruitment_team_id", "recruitments", ["team_id"])
    op.create_foreign_key(
        "fk_recruitments_team_id_teams", "recruitments", "teams", ["team_id"], ["id"]
    )


def downgrade() -> None:
    # Refuse destructive downgrade if standalone teams, formal members, or invitations exist.
    conn = op.get_bind()
    standalone_teams = conn.execute(
        sa.text(
            """
            SELECT COUNT(*) FROM teams t
            LEFT JOIN recruitments r ON r.team_id = t.id
            WHERE r.id IS NULL
            """
        )
    ).scalar()
    formal_members = conn.execute(
        sa.text("SELECT COUNT(*) FROM team_members WHERE role = 'member'")
    ).scalar()
    invitations = conn.execute(sa.text("SELECT COUNT(*) FROM team_invitations")).scalar()
    if standalone_teams or formal_members or invitations:
        raise RuntimeError(
            "Cannot losslessly downgrade 0016_team_membership: standalone teams, formal members, "
            "or team invitations exist."
        )

    op.drop_constraint("fk_recruitments_team_id_teams", "recruitments", type_="foreignkey")
    op.drop_constraint("uq_recruitment_team_id", "recruitments", type_="unique")
    op.drop_column("recruitments", "team_id")

    op.drop_table("team_invitations")
    op.drop_table("team_members")
    op.drop_table("teams")

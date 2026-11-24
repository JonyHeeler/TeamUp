from collections import defaultdict
from datetime import timedelta

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0003_profile_and_team_details"
down_revision = "0002_profile_evidence"
branch_labels = None
depends_on = None

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
NEW_SKILLS = {
    "mathematical-modeling": "数学建模",
    "machine-learning": "机器学习",
    "agent-development": "智能体开发",
    "data-collection": "数据采集",
    "frontend": "前端开发",
    "backend": "后端开发",
    "product-management": "产品策划",
    "user-research": "用户调研",
    "academic-writing": "论文写作",
    "business-analysis": "商业分析",
    "finance": "财务分析",
    "video-editing": "视频制作",
    "project-management": "项目管理",
}


def upgrade() -> None:
    for name in ("college", "availability", "preferred_role", "interests"):
        op.add_column("profiles", sa.Column(name, sa.String(80), nullable=True))
        op.add_column(
            "profiles",
            sa.Column(
                "show_" + name,
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1" if name == "college" else "0"),
            ),
        )
    for name in ("custom_skills", "custom_fields"):
        op.add_column("profiles", sa.Column(name, sa.JSON(), nullable=True))

    counters = op.create_table(
        "team_number_counters",
        sa.Column("day", mysql.CHAR(8, charset="ascii", collation="ascii_bin"), primary_key=True),
        sa.Column("last_index", sa.Integer(), nullable=False),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    number_type = mysql.CHAR(11, charset="ascii", collation="ascii_bin")
    op.add_column("recruitments", sa.Column("team_number", number_type, nullable=True))
    op.add_column("recruitments", sa.Column("requirements", sa.JSON(), nullable=True))
    op.alter_column(
        "recruitments",
        "task",
        existing_type=sa.String(500),
        type_=sa.String(1200),
        existing_nullable=False,
    )
    db = op.get_bind()
    teams = sa.table(
        "recruitments",
        sa.column("id", sa.String(36)),
        sa.column("created_at", sa.DateTime()),
        sa.column("openings", sa.Integer()),
        sa.column("team_number", sa.String(11)),
        sa.column("requirements", sa.JSON(none_as_null=True)),
    )
    skills_by_team = defaultdict(list)
    for team_id, code in db.execute(
        sa.text("SELECT recruitment_id, skill_code FROM recruitment_skills ORDER BY skill_code")
    ):
        skills_by_team[team_id].append(code)

    daily_indices: dict[str, int] = defaultdict(int)
    old_records = db.execute(
        sa.select(teams.c.id, teams.c.created_at, teams.c.openings).order_by(
            teams.c.created_at, teams.c.id
        )
    ).all()
    for team_id, created_at, openings in old_records:
        day = (created_at + timedelta(hours=8)).strftime("%Y%m%d")
        daily_indices[day] += 1
        index = daily_indices[day]
        if index >= 36**3:
            raise RuntimeError(f"Team number space exhausted for {day}")
        suffix = "".join(ALPHABET[index // 36**power % 36] for power in (2, 1, 0))
        skills = skills_by_team[team_id]
        fields = {"team_number": day + suffix}
        if skills and openings <= 100:
            fields["requirements"] = [{"skills": skills, "expectation": None}] * openings
        db.execute(teams.update().where(teams.c.id == team_id).values(**fields))
    if daily_indices:
        op.bulk_insert(
            counters, [{"day": day, "last_index": index} for day, index in daily_indices.items()]
        )
    op.alter_column("recruitments", "team_number", existing_type=number_type, nullable=False)
    op.create_unique_constraint("uq_recruitment_team_number", "recruitments", ["team_number"])
    op.create_check_constraint(
        "ck_recruitment_requirement_count",
        "recruitments",
        "requirements IS NULL OR (JSON_TYPE(requirements) = 'ARRAY' AND JSON_LENGTH(requirements) = openings)",
    )

    skills = sa.table("skills", sa.column("code"), sa.column("label"))
    for code, label in NEW_SKILLS.items():
        add_skill = mysql.insert(skills).values(code=code, label=label)
        db.execute(add_skill.on_duplicate_key_update(label=skills.c.label))


def downgrade() -> None:
    op.alter_column(
        "recruitments",
        "task",
        existing_type=sa.String(1200),
        type_=sa.String(500),
        existing_nullable=False,
    )
    op.drop_constraint("ck_recruitment_requirement_count", "recruitments", type_="check")
    op.drop_constraint("uq_recruitment_team_number", "recruitments", type_="unique")
    op.drop_column("recruitments", "requirements")
    op.drop_column("recruitments", "team_number")
    op.drop_table("team_number_counters")
    for name in ("custom_fields", "custom_skills"):
        op.drop_column("profiles", name)
    for name in ("college", "availability", "preferred_role", "interests"):
        op.drop_column("profiles", "show_" + name)
        op.drop_column("profiles", name)

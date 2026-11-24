import sqlalchemy as sa
from alembic import op

revision = "0007_demo_competitions"
down_revision = "0006_skill_tags"
branch_labels = None
depends_on = None

DEMO_COMPETITIONS = (
    ("10000000-0000-4000-8000-000000000001", "数学建模校赛", "美赛"),
    ("10000000-0000-4000-8000-000000000002", "校园创新创业大赛", "AI 智能体 + 校赛"),
)


def rename_competition(recruitment_id: str, before: str, after: str) -> None:
    recruitments = sa.table("recruitments", sa.column("id"), sa.column("competition"))
    op.get_bind().execute(
        recruitments.update()
        .where(recruitments.c.id == recruitment_id, recruitments.c.competition == before)
        .values(competition=after)
    )


def upgrade() -> None:
    for recruitment_id, before, after in DEMO_COMPETITIONS:
        rename_competition(recruitment_id, before, after)


def downgrade() -> None:
    for recruitment_id, before, after in DEMO_COMPETITIONS:
        rename_competition(recruitment_id, after, before)

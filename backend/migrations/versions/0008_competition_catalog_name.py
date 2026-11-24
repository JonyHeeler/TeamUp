import sqlalchemy as sa
from alembic import op

revision = "0008_competition_catalog_name"
down_revision = "0007_demo_competitions"
branch_labels = None
depends_on = None


def rename(before: str, after: str) -> None:
    recruitments = sa.table("recruitments", sa.column("competition"))
    op.get_bind().execute(
        recruitments.update()
        .where(recruitments.c.competition == before)
        .values(competition=after)
    )


def upgrade() -> None:
    rename("AI 智能体 + 校赛", "AI 智能体+ 大赛校赛")


def downgrade() -> None:
    rename("AI 智能体+ 大赛校赛", "AI 智能体 + 校赛")

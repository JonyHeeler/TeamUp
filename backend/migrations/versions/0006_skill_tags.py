import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0006_skill_tags"
down_revision = "0005_profile_projects"
branch_labels = None
depends_on = None

NEW_SKILLS = {
    "mobile-development": "移动端开发",
    "statistics": "统计分析",
    "data-visualization": "数据可视化",
    "ui-ux": "界面与交互设计",
    "graphic-design": "平面设计",
    "market-research": "市场调研",
    "business-planning": "商业策划",
    "slide-design": "演示文稿制作",
    "copywriting": "文案写作",
}


def upgrade() -> None:
    skills = sa.table("skills", sa.column("code"), sa.column("label"))
    db = op.get_bind()
    for code, label in NEW_SKILLS.items():
        insert = mysql.insert(skills).values(code=code, label=label)
        db.execute(insert.on_duplicate_key_update(label=skills.c.label))


def downgrade() -> None:
    # Keep catalog rows because profiles and recruitments may reference them.
    pass

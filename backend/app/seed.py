from datetime import datetime

from app.competitions import OFFICIAL_COMPETITIONS
from app.db.models import Contact, Profile, Recruitment, Skill, User
from app.db.session import SessionLocal
from app.demo import PERSONAS


def seed():
    with SessionLocal() as db:
        for code, label in [
            ("data-analysis", "数据分析"),
            ("development", "开发"),
            ("design", "设计"),
            ("presentation", "展示"),
        ]:
            if not db.get(Skill, code):
                db.add(Skill(code=code, label=label))
        db.flush()
        users = [
            ("captain", "林舟", "DEMO-QQ-001", "组织团队并推进项目", "presentation"),
            ("candidate-a", "许言", "DEMO-QQ-002", "清洗数据并完成统计分析", "data-analysis"),
            ("candidate-b", "周禾", "DEMO-QQ-003", "开发原型并制作展示页面", "development"),
        ]
        for persona, nickname, qq, contribution, skill in users:
            user_id = PERSONAS[persona]
            if not db.get(User, user_id):
                db.add(User(id=user_id, nickname=nickname))
                db.flush()
            if not db.get(Contact, user_id):
                db.add(Contact(user_id=user_id, qq=qq))
            if not db.get(Profile, user_id):
                db.add(
                    Profile(
                        user_id=user_id,
                        contribution=contribution,
                        show_major=False,
                        show_grade=False,
                        show_experience=False,
                        skills=[db.get(Skill, skill)],
                    )
                )
        db.flush()
        rows = [
            (
                "10000000-0000-4000-8000-000000000001",
                OFFICIAL_COMPETITIONS["math-modeling"].name,
                "数学建模队",
                1,
                "清洗问卷数据、汇总关键指标并参与建模",
                ["data-analysis"],
            ),
            (
                "10000000-0000-4000-8000-000000000002",
                OFFICIAL_COMPETITIONS["campus-innovation"].name,
                "校园创新组",
                2,
                "实现原型和设计展示页",
                ["development", "design"],
            ),
        ]
        for recruitment_id, competition, team_name, openings, task, skills in rows:
            if not db.get(Recruitment, recruitment_id):
                db.add(
                    Recruitment(
                        id=recruitment_id,
                        owner_id=PERSONAS["captain"],
                        competition=competition,
                        team_name=team_name,
                        openings=openings,
                        task=task,
                        created_at=datetime(2026, 11, 24),
                        skills=[db.get(Skill, code) for code in skills],
                    )
                )
        db.commit()


if __name__ == "__main__":
    seed()

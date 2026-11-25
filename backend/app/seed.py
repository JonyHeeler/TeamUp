import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import (
    Contact,
    Profile,
    ProfileEvidence,
    Recruitment,
    Skill,
    Team,
    TeamMember,
    User,
)
from app.db.session import SessionLocal
from app.demo import PERSONAS
from app.services import teamup
from app.services.team_numbers import next_team_number
from app.skills import SKILL_LABELS

DEMO_DATA = Path(__file__).with_name("demo_data")
PREVIOUS_INTRODUCTIONS = {
    "captain": "组织团队并推进项目",
    "candidate-a": "清洗数据并完成统计分析",
    "candidate-b": "开发原型并制作展示页面",
}


def seed_profiles(db: Session, fill_profiles: bool) -> None:
    records = json.loads((DEMO_DATA / "profiles.json").read_text(encoding="utf-8"))
    for persona, user_id in PERSONAS.items():
        record = records[persona]
        if not db.get(User, user_id):
            db.add(User(id=user_id, nickname=record["nickname"]))
            db.flush()
        if not db.get(Contact, user_id):
            db.add(Contact(user_id=user_id, qq=record["qq"]))
        profile = db.get(Profile, user_id)
        if profile is not None and not fill_profiles:
            continue
        new_profile = profile is None
        if new_profile:
            profile = Profile(user_id=user_id)
            db.add(profile)
        original_seed = (
            profile.introduction == PREVIOUS_INTRODUCTIONS[persona]
            and not profile.projects
            and not profile.experience
            and not profile.major
            and not profile.grade
            and not profile.competition_intent
            and not profile.custom_skills
            and len(profile.skills) == 1
        )
        use_demo_defaults = new_profile or original_seed
        if use_demo_defaults or profile.introduction == PREVIOUS_INTRODUCTIONS[persona]:
            profile.introduction = record["contribution"]
            codes = set(record["skills"]) | {skill.code for skill in profile.skills}
            profile.skills = [db.get(Skill, code) for code in sorted(codes)]
        for field, attribute in teamup.PROFILE_FIELDS.items():
            if not getattr(profile, attribute):
                setattr(profile, attribute, record[field])
                if use_demo_defaults:
                    setattr(profile, "show_" + attribute, record["publicFields"][field])
        if not profile.custom_skills:
            profile.custom_skills = record["customSkills"]
        missing_projects = not profile.projects
        if missing_projects:
            profile.projects = record["projects"]
        db.flush()
        evidence = db.scalar(
            select(ProfileEvidence.id).where(ProfileEvidence.user_id == user_id).limit(1)
        )
        if (use_demo_defaults or missing_projects) and evidence is None:
            for position, evidence_id in enumerate(record["evidenceIds"]):
                evidence_id = str(UUID(evidence_id))
                db.add(
                    ProfileEvidence(
                        id=evidence_id,
                        user_id=user_id,
                        position=position,
                        image=(DEMO_DATA / f"{evidence_id}.webp").read_bytes(),
                    )
                )


def seed(
    fill_profiles: bool = False, refresh_recruitments: bool = False, foundation_only: bool = False
):
    foundation_only = foundation_only or get_settings().auth_mode == "student"
    with SessionLocal() as db:
        for code, label in SKILL_LABELS.items():
            if not db.get(Skill, code):
                db.add(Skill(code=code, label=label))
        db.flush()
        if foundation_only:
            db.commit()
            return
        seed_profiles(db, fill_profiles)
        db.flush()
        rows = json.loads((DEMO_DATA / "recruitments.json").read_text(encoding="utf-8"))
        old_names = {
            ("数学建模队", "清洗问卷数据、汇总关键指标并参与建模"),
            ("校园创新组", "实现原型和设计展示页"),
            ("校园创新组", "实现校园服务智能体原型，设计操作界面并准备现场展示"),
        }
        for row in rows:
            created_at = datetime(2026, 11, 24)
            team_entity = db.get(Team, row["id"])
            recruitment = db.get(Recruitment, row["id"])
            if team_entity is None:
                number = (
                    recruitment.team_number
                    if recruitment is not None
                    else next_team_number(db, created_at)
                )
                team_entity = Team(
                    id=row["id"],
                    captain_id=row["ownerId"],
                    competition=row["competition"],
                    team_name=row["teamName"],
                    team_number=number,
                    description=row["background"],
                    status="active",
                    created_at=created_at,
                )
                db.add(team_entity)
                db.flush()
            if db.get(TeamMember, (team_entity.id, row["ownerId"])) is None:
                db.add(
                    TeamMember(
                        team_id=team_entity.id,
                        user_id=row["ownerId"],
                        role="captain",
                        joined_at=team_entity.created_at,
                    )
                )
            if recruitment is None:
                published_at = teamup.now()
                recruitment = Recruitment(
                    id=row["id"],
                    team_id=team_entity.id,
                    owner_id=row["ownerId"],
                    team_number=team_entity.team_number,
                    published_at=published_at,
                    expires_at=published_at + timedelta(days=14),
                    duration_days=14,
                    created_at=created_at,
                )
                db.add(recruitment)
            elif (
                not refresh_recruitments
                or (recruitment.team_name, recruitment.background) not in old_names
            ):
                continue
            team_entity.competition = row["competition"]
            team_entity.team_name = row["teamName"]
            team_entity.description = row["background"]
            recruitment.competition = row["competition"]
            recruitment.team_name = row["teamName"]
            recruitment.openings = row["openings"]
            recruitment.background = row["background"]
            recruitment.requirements = row["requirements"]
            recruitment.skills = [db.get(Skill, code) for code in row["skills"]]
        db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--foundation-only", action="store_true", help="只初始化技能等基础数据")
    parser.add_argument("--fill-profiles", action="store_true", help="补齐已有演示名片的空白字段")
    parser.add_argument(
        "--refresh-recruitments", action="store_true", help="替换旧版预置的两条演示招募"
    )
    args = parser.parse_args()
    if args.foundation_only and (args.fill_profiles or args.refresh_recruitments):
        parser.error("--foundation-only 不能与演示数据更新选项同时使用")
    if (args.fill_profiles or args.refresh_recruitments) and not get_settings().demo_mode:
        parser.error("更新已有演示数据的选项仅适用于本地 Demo 模式")
    seed(
        fill_profiles=args.fill_profiles,
        refresh_recruitments=args.refresh_recruitments,
        foundation_only=args.foundation_only,
    )

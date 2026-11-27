from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.competitions import OFFICIAL_COMPETITION_NAMES
from app.config import get_settings
from app.db.models import Contact, Recruitment, Skill, StudentAccount
from app.services.common import (
    ServiceError,
    active_account,
    get_skills,
    invalid,
    invalid_field,
    missing,
    now,
    optional_text,
    text,
    timestamp,
    visible_member,
)
from app.services.team_numbers import TeamNumberExhausted, next_team_number


def recruitment_data(recruitment: Recruitment) -> dict[str, Any]:
    """Project a recruitment for API responses."""
    return {
        "id": recruitment.id,
        "ownerId": recruitment.owner_id,
        "ownerNickname": recruitment.owner.nickname,
        "competition": recruitment.competition,
        "teamName": recruitment.team_name,
        "isPublished": recruitment.is_published,
        "teamNumber": recruitment.team_number,
        "openings": recruitment.openings,
        "skills": sorted(s.code for s in recruitment.skills),
        "requirements": (
            recruitment.requirements
            if recruitment.requirements is not None
            else (
                [{"skills": sorted(s.code for s in recruitment.skills), "expectation": None}]
                if recruitment.skills
                else []
            )
        ),
        "background": recruitment.background,
        "createdAt": timestamp(recruitment.created_at),
    }


def list_recruitments(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
    """List publicly visible recruitments."""
    query = select(Recruitment).where(
        Recruitment.is_published.is_(True),
        Recruitment.competition.collate("utf8mb4_bin").in_(OFFICIAL_COMPETITION_NAMES),
    )
    if get_settings().auth_mode == "student":
        query = query.where(active_account(Recruitment.owner_id))
    if skill:
        query = query.where(Recruitment.skills.any(Skill.code == skill))
    return [recruitment_data(r) for r in db.scalars(query.order_by(Recruitment.created_at.desc()))]


def get_recruitment(db: Session, recruitment_id: str) -> dict[str, Any]:
    """Read a publicly visible recruitment."""
    recruitment = db.get(Recruitment, recruitment_id)
    if (
        not recruitment
        or not recruitment.is_published
        or recruitment.competition not in OFFICIAL_COMPETITION_NAMES
        or not visible_member(db, recruitment.owner_id)
    ):
        raise missing()
    return recruitment_data(recruitment)


def recruitment_fields(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    """Validate and prepare recruitment fields."""
    competition = text(data.get("competition"), 80)
    if competition not in OFFICIAL_COMPETITION_NAMES:
        message = "请选择官方比赛"
        raise ServiceError(422, "validation_error", message, {"competition": message})
    openings = optional_text(data.get("openings"), 40)
    requirements = data.get("requirements", [])
    positions = []
    codes = []
    for index, requirement in enumerate(requirements):
        skills = list(dict.fromkeys(requirement.get("skills", [])))
        expectation = optional_text(requirement.get("expectation"), 500)
        if not skills and expectation is None:
            raise invalid_field(f"requirements.{index}", "请选择技能标签或填写期望")
        positions.append({"skills": skills, "expectation": expectation})
        codes.extend(skills)
    return {
        "competition": competition,
        "openings": openings,
        "requirements": positions,
        "skills": get_skills(db, codes),
        "background": text(data.get("background"), 1200),
        "team_name": optional_text(data.get("teamName"), 80),
    }


def create_recruitment(db: Session, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Create a recruitment and assign a team number."""
    if get_settings().auth_mode == "student":
        account = db.get(StudentAccount, user_id, with_for_update=True)
        if not account or account.status != "active":
            raise ServiceError(403, "forbidden", "该账号无法发布招募")
        if not db.get(Contact, user_id):
            raise invalid("请先在个人名片中填写 QQ，再发布招募")
    fields = recruitment_fields(db, data)
    created_at = now()
    try:
        number = next_team_number(db, created_at)
    except TeamNumberExhausted as exc:
        raise ServiceError(409, "team_number_exhausted", str(exc)) from exc
    fields["team_name"] = fields["team_name"] or number
    recruitment = Recruitment(
        id=str(uuid4()),
        owner_id=user_id,
        team_number=number,
        created_at=created_at,
        **fields,
    )
    db.add(recruitment)
    db.commit()
    return recruitment_data(recruitment)


def list_own_recruitments(db: Session, user_id: str) -> list[dict[str, Any]]:
    """List recruitments belonging to a captain."""
    query = select(Recruitment).where(Recruitment.owner_id == user_id)
    return [
        recruitment_data(row) for row in db.scalars(query.order_by(Recruitment.created_at.desc()))
    ]


def owned_recruitment(db: Session, user_id: str, recruitment_id: str) -> Recruitment:
    """Lock a recruitment and check captain access."""
    recruitment = db.get(Recruitment, recruitment_id, with_for_update=True)
    if not recruitment:
        raise missing()
    if recruitment.owner_id != user_id:
        raise ServiceError(403, "forbidden", "只有队长可以管理队伍")
    return recruitment


def update_recruitment(
    db: Session, user_id: str, recruitment_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    """Update a captain recruitment."""
    recruitment = owned_recruitment(db, user_id, recruitment_id)
    fields = recruitment_fields(db, data)
    fields["team_name"] = fields["team_name"] or recruitment.team_number
    for field, value in fields.items():
        setattr(recruitment, field, value)
    db.commit()
    return recruitment_data(recruitment)


def set_recruitment_visibility(
    db: Session, user_id: str, recruitment_id: str, is_published: bool
) -> dict[str, Any]:
    """Change publication visibility for a recruitment."""
    recruitment = owned_recruitment(db, user_id, recruitment_id)
    if is_published and recruitment.competition not in OFFICIAL_COMPETITION_NAMES:
        raise ServiceError(409, "conflict", "请先编辑招募，选择当前赛事后再上架")
    recruitment.is_published = is_published
    db.commit()
    return recruitment_data(recruitment)

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Contact, Intent, Profile, Recruitment, Skill, User


class ServiceError(Exception):
    def __init__(self, status: int, code: str, message: str, fields: dict | None = None):
        self.status, self.code, self.message, self.fields = status, code, message, fields
        super().__init__(message)


def missing() -> ServiceError:
    return ServiceError(404, "not_found", "未找到记录")


def invalid(message: str) -> ServiceError:
    return ServiceError(422, "validation_error", message)


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def timestamp(value: datetime) -> str:
    return value.isoformat(timespec="microseconds") + "Z"


def text(value: Any, maximum: int) -> str:
    if not isinstance(value, str) or not (value := value.strip()) or len(value) > maximum:
        raise invalid("请填写有效的文本")
    return value


def optional_text(value: Any, maximum: int) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return text(value, maximum)


def get_skills(db: Session, codes: Any) -> list[Skill]:
    if not isinstance(codes, list) or not codes or any(not isinstance(c, str) for c in codes):
        raise invalid("请至少选择一项技能")
    codes = list(dict.fromkeys(codes))
    skills = list(db.scalars(select(Skill).where(Skill.code.in_(codes))))
    if len(skills) != len(codes):
        raise invalid("技能无效")
    return skills


def profile_data(profile: Profile, private: bool = False) -> dict[str, Any]:
    result = {
        "userId": profile.user_id,
        "nickname": profile.user.nickname,
        "skills": sorted(s.code for s in profile.skills),
        "contribution": profile.contribution,
    }
    for field in ("major", "grade", "experience"):
        if private or getattr(profile, "show_" + field):
            result[field] = getattr(profile, field)
    if private:
        result["publicFields"] = {
            field: getattr(profile, "show_" + field) for field in ("major", "grade", "experience")
        }
    return result


def get_user(db: Session, user_id: str) -> dict[str, Any]:
    user = db.get(User, user_id)
    if not user:
        raise missing()
    return {"userId": user.id, "nickname": user.nickname}


def list_profiles(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
    query = select(Profile)
    if skill:
        query = query.where(Profile.skills.any(Skill.code == skill))
    return [profile_data(p) for p in db.scalars(query.order_by(Profile.user_id))]


def get_profile(db: Session, user_id: str, private: bool = False) -> dict[str, Any]:
    profile = db.get(Profile, user_id)
    if not profile:
        raise missing()
    return profile_data(profile, private)


def put_profile(db: Session, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise missing()
    contribution = text(data.get("contribution"), 500)
    skills = get_skills(db, data.get("skills"))
    optional = {
        field: optional_text(data.get(field), 500 if field == "experience" else 80)
        for field in ("major", "grade", "experience")
    }
    public = data.get("publicFields", {})
    if not isinstance(public, dict) or any(
        not isinstance(public.get(field, False), bool) for field in optional
    ):
        raise invalid("公开字段无效")
    nickname = text(data.get("nickname", user.nickname), 80)
    profile = db.get(Profile, user_id)
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)
    user.nickname = nickname
    profile.contribution = contribution
    profile.skills = skills
    for field, value in optional.items():
        setattr(profile, field, value)
        setattr(profile, "show_" + field, public.get(field, False))
    db.commit()
    return profile_data(profile, True)


def recruitment_data(recruitment: Recruitment) -> dict[str, Any]:
    return {
        "id": recruitment.id,
        "ownerId": recruitment.owner_id,
        "competition": recruitment.competition,
        "teamName": recruitment.team_name,
        "openings": recruitment.openings,
        "skills": sorted(s.code for s in recruitment.skills),
        "task": recruitment.task,
        "createdAt": timestamp(recruitment.created_at),
    }


def list_recruitments(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
    query = select(Recruitment)
    if skill:
        query = query.where(Recruitment.skills.any(Skill.code == skill))
    return [recruitment_data(r) for r in db.scalars(query.order_by(Recruitment.created_at.desc()))]


def get_recruitment(db: Session, recruitment_id: str) -> dict[str, Any]:
    recruitment = db.get(Recruitment, recruitment_id)
    if not recruitment:
        raise missing()
    return recruitment_data(recruitment)


def create_recruitment(db: Session, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    openings = data.get("openings")
    if isinstance(openings, bool) or not isinstance(openings, int) or openings <= 0:
        raise invalid("招募人数须为正整数")
    recruitment = Recruitment(
        id=str(uuid4()),
        owner_id=user_id,
        competition=text(data.get("competition"), 80),
        team_name=text(data.get("teamName"), 80),
        openings=openings,
        task=text(data.get("task"), 500),
        created_at=now(),
        skills=get_skills(db, data.get("skills")),
    )
    db.add(recruitment)
    db.commit()
    return recruitment_data(recruitment)


def intent_data(intent: Intent, user_id: str) -> dict[str, Any]:
    recipient = intent.recruitment.owner_id if intent.kind == "apply" else intent.candidate_id
    result = {
        "id": intent.id,
        "recruitmentId": intent.recruitment_id,
        "candidateId": intent.candidate_id,
        "ownerId": intent.recruitment.owner_id,
        "kind": intent.kind,
        "status": intent.status,
        "createdAt": timestamp(intent.created_at),
        "canRespond": intent.status == "pending" and user_id == recipient,
    }
    if intent.responded_at:
        result["respondedAt"] = timestamp(intent.responded_at)
    return result


def list_intents(db: Session, user_id: str) -> list[dict[str, Any]]:
    query = (
        select(Intent)
        .join(Recruitment)
        .where(or_(Intent.candidate_id == user_id, Recruitment.owner_id == user_id))
        .order_by(Intent.created_at.desc())
    )
    return [intent_data(i, user_id) for i in db.scalars(query)]


def participant_intent(db: Session, user_id: str, intent_id: str) -> Intent:
    intent = db.get(Intent, intent_id)
    if not intent or user_id not in (intent.candidate_id, intent.recruitment.owner_id):
        raise missing()
    return intent


def get_intent(db: Session, user_id: str, intent_id: str) -> dict[str, Any]:
    intent = participant_intent(db, user_id, intent_id)
    result = intent_data(intent, user_id)
    if intent.status == "accepted":
        other = (
            intent.candidate_id
            if user_id == intent.recruitment.owner_id
            else intent.recruitment.owner_id
        )
        contact = db.get(Contact, other)
        if contact:
            result["counterpartQq"] = contact.qq
    return result


def create_intent(db: Session, user_id: str, data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    kind = data.get("kind")
    if kind not in ("apply", "invite"):
        raise invalid("意向类型无效")
    recruitment = db.get(Recruitment, data.get("recruitmentId"))
    if not recruitment:
        raise missing()
    candidate = user_id if kind == "apply" else data.get("candidateId")
    if kind == "invite" and recruitment.owner_id != user_id:
        raise ServiceError(403, "forbidden", "只有队长可以邀请")
    if not candidate or candidate == recruitment.owner_id or not db.get(Profile, candidate):
        raise invalid("候选人无效或尚未发布名片")
    if not db.scalar(select(Contact.user_id).where(Contact.user_id == candidate)) or not db.scalar(
        select(Contact.user_id).where(Contact.user_id == recruitment.owner_id)
    ):
        raise invalid("双方均需有联系方式")
    intent = Intent(
        id=str(uuid4()),
        recruitment_id=recruitment.id,
        candidate_id=candidate,
        kind=kind,
        status="pending",
        created_at=now(),
    )
    db.add(intent)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if not (
            exc.orig.args
            and exc.orig.args[0] == 1062
            and "uq_intent_recruitment_candidate" in str(exc.orig)
        ):
            raise
        existing = db.scalar(
            select(Intent).where(
                Intent.recruitment_id == recruitment.id, Intent.candidate_id == candidate
            )
        )
        if not existing:
            raise
        return intent_data(existing, user_id), False
    return intent_data(intent, user_id), True


def respond_intent(db: Session, user_id: str, intent_id: str, decision: str) -> dict[str, Any]:
    if decision not in ("accepted", "declined"):
        raise invalid("回应无效")
    intent = participant_intent(db, user_id, intent_id)
    recipient = intent.recruitment.owner_id if intent.kind == "apply" else intent.candidate_id
    if recipient != user_id:
        raise ServiceError(403, "forbidden", "只有收件人可以回应")
    result = db.execute(
        update(Intent)
        .where(Intent.id == intent_id, Intent.status == "pending")
        .values(status=decision, responded_at=now())
        .execution_options(synchronize_session=False)
    )
    db.commit()
    db.expire_all()
    intent = db.get(Intent, intent_id)
    if result.rowcount == 0 and intent.status != decision:
        raise ServiceError(409, "conflict", "意向已有不同回应")
    return intent_data(intent, user_id)

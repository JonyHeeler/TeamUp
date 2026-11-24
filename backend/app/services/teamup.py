from datetime import UTC, datetime
from re import fullmatch
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.competitions import OFFICIAL_COMPETITION_NAMES
from app.db.models import Contact, Intent, Profile, ProfileEvidence, Recruitment, Skill, User
from app.services.evidence import InvalidEvidence, prepare_image
from app.services.team_numbers import TeamNumberExhausted, next_team_number

PROFILE_FIELDS = {
    "college": "college",
    "major": "major",
    "grade": "grade",
    "experience": "experience",
    "availability": "availability",
    "preferredRole": "preferred_role",
    "interests": "interests",
}


class ServiceError(Exception):
    def __init__(self, status: int, code: str, message: str, fields: dict | None = None):
        self.status, self.code, self.message, self.fields = status, code, message, fields
        super().__init__(message)


def missing() -> ServiceError:
    return ServiceError(404, "not_found", "未找到记录")


def invalid(message: str) -> ServiceError:
    return ServiceError(422, "validation_error", message)


def invalid_field(field: str, message: str) -> ServiceError:
    return ServiceError(422, "validation_error", message, {field: message})


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
    if not isinstance(codes, list) or any(not isinstance(c, str) for c in codes):
        raise invalid("技能无效")
    if not codes:
        return []
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
        "contribution": profile.introduction,
        "customSkills": profile.custom_skills or [],
    }
    for field, attribute in PROFILE_FIELDS.items():
        value = getattr(profile, attribute)
        if private or (value and getattr(profile, "show_" + attribute)):
            result[field] = value
    custom_fields = profile.custom_fields or []
    if private:
        result["publicFields"] = {
            field: getattr(profile, "show_" + attribute)
            for field, attribute in PROFILE_FIELDS.items()
        }
        result["customFields"] = custom_fields
    else:
        result["customFields"] = [
            {"label": field["label"], "value": field["value"]}
            for field in custom_fields
            if field["isPublic"]
        ]
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


def evidence_ids(db: Session, user_id: str) -> list[str]:
    return list(
        db.scalars(
            select(ProfileEvidence.id)
            .where(ProfileEvidence.user_id == user_id)
            .order_by(ProfileEvidence.position)
        )
    )


def get_evidence(db: Session, user_id: str, image_id: str, viewer_id: str | None) -> bytes:
    query = (
        select(ProfileEvidence.image)
        .join(Profile, Profile.user_id == ProfileEvidence.user_id)
        .where(ProfileEvidence.user_id == user_id, ProfileEvidence.id == image_id)
    )
    if viewer_id != user_id:
        query = query.where(Profile.show_experience.is_(True))
    image = db.scalar(query)
    if image is None:
        raise missing()
    return image


def get_profile(db: Session, user_id: str, private: bool = False) -> dict[str, Any]:
    profile = db.get(Profile, user_id)
    if not profile:
        raise missing()
    result = profile_data(profile, private)
    if private:
        contact = db.get(Contact, user_id)
        result["qq"] = contact.qq if contact else None
    if private or profile.show_experience:
        ids = evidence_ids(db, user_id)
        if private or ids:
            result["evidenceIds"] = ids
    return result


def replace_evidence(
    db: Session, user_id: str, entries: list[tuple[str, bytes | None]]
) -> list[str]:
    keep = {item_id for item_id, image in entries if image is None}
    existing = set(evidence_ids(db, user_id))
    if not keep.issubset(existing):
        message = "有一张图片证明已失效，请重新打开名片"
        raise ServiceError(422, "validation_error", message, {"evidence": message})
    if existing - keep:
        db.execute(
            delete(ProfileEvidence).where(
                ProfileEvidence.user_id == user_id, ProfileEvidence.id.in_(existing - keep)
            )
        )
    for position, (item_id, image) in enumerate(entries):
        if image is None:
            db.execute(
                update(ProfileEvidence)
                .where(ProfileEvidence.user_id == user_id, ProfileEvidence.id == item_id)
                .values(position=position)
            )
        else:
            db.add(ProfileEvidence(id=item_id, user_id=user_id, image=image, position=position))
    return [item_id for item_id, _ in entries]


def put_profile(db: Session, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    images = data.get("evidence")
    entries: list[tuple[str, bytes | None]] | None = None
    if images is not None:
        try:
            entries = [
                (item["id"], None) if "id" in item else (str(uuid4()), prepare_image(item["image"]))
                for item in images
            ]
            if len({item_id for item_id, _ in entries}) != len(entries):
                raise InvalidEvidence("同一张图片证明只能保留一次")
        except InvalidEvidence as exc:
            raise ServiceError(422, "validation_error", str(exc), {"evidence": str(exc)}) from exc
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise missing()
    introduction = text(data.get("contribution"), 500)
    college = text(data.get("college"), 80)
    skills = get_skills(db, data.get("skills"))
    custom_skills = list(dict.fromkeys(data.get("customSkills", [])))
    if not skills and not custom_skills:
        raise invalid_field("skills", "请至少选择或填写一项技能")
    custom_fields = data.get("customFields", [])
    if len({field["label"].casefold() for field in custom_fields}) != len(custom_fields):
        raise invalid_field("customFields", "自定义字段名称不能重复")
    optional = {
        field: optional_text(data.get(field), 500 if field == "experience" else 80)
        for field in PROFILE_FIELDS
        if field != "college"
    }
    public = data.get("publicFields", {})
    nickname = text(data.get("nickname", user.nickname), 80)
    qq = text(data.get("qq"), 64)
    contact = db.get(Contact, user_id)
    if not fullmatch(r"[0-9]{5,12}", qq) and (contact is None or qq != contact.qq):
        raise invalid_field("qq", "请输入 5 至 12 位数字的 QQ 号")
    if contact is None:
        db.add(Contact(user_id=user_id, qq=qq))
    else:
        contact.qq = qq
    profile = db.get(Profile, user_id)
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)
    user.nickname = nickname
    profile.introduction = introduction
    profile.skills = skills
    profile.custom_skills = custom_skills
    profile.custom_fields = custom_fields
    values = {"college": college, **optional}
    for field, attribute in PROFILE_FIELDS.items():
        setattr(profile, attribute, values[field])
        setattr(profile, "show_" + attribute, public.get(field, field == "college"))
    db.flush()
    result = profile_data(profile, True)
    result["qq"] = qq
    result["evidenceIds"] = (
        evidence_ids(db, user_id) if entries is None else replace_evidence(db, user_id, entries)
    )
    db.commit()
    return result


def recruitment_data(recruitment: Recruitment) -> dict[str, Any]:
    return {
        "id": recruitment.id,
        "ownerId": recruitment.owner_id,
        "competition": recruitment.competition,
        "teamName": recruitment.team_name,
        "teamNumber": recruitment.team_number,
        "openings": recruitment.openings,
        "skills": sorted(s.code for s in recruitment.skills),
        "requirements": recruitment.requirements or [],
        "background": recruitment.background,
        "createdAt": timestamp(recruitment.created_at),
    }


def list_recruitments(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
    query = select(Recruitment).where(
        Recruitment.competition.collate("utf8mb4_bin").in_(OFFICIAL_COMPETITION_NAMES)
    )
    if skill:
        query = query.where(Recruitment.skills.any(Skill.code == skill))
    return [recruitment_data(r) for r in db.scalars(query.order_by(Recruitment.created_at.desc()))]


def get_recruitment(db: Session, recruitment_id: str) -> dict[str, Any]:
    recruitment = db.get(Recruitment, recruitment_id)
    if not recruitment or recruitment.competition not in OFFICIAL_COMPETITION_NAMES:
        raise missing()
    return recruitment_data(recruitment)


def create_recruitment(db: Session, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    competition = text(data.get("competition"), 80)
    if competition not in OFFICIAL_COMPETITION_NAMES:
        message = "请选择官方比赛"
        raise ServiceError(422, "validation_error", message, {"competition": message})
    openings = data.get("openings")
    requirements = data.get("requirements", [])
    if len(requirements) != openings:
        raise invalid_field("requirements", "为每个招募名额填写一条需求")
    positions = []
    codes = []
    for index, requirement in enumerate(requirements):
        skills = list(dict.fromkeys(requirement.get("skills", [])))
        expectation = optional_text(requirement.get("expectation"), 500)
        if not skills and expectation is None:
            raise invalid_field(f"requirements.{index}", "请选择技能标签或填写期望")
        positions.append({"skills": skills, "expectation": expectation})
        codes.extend(skills)
    all_skills = get_skills(db, codes)
    background = text(data.get("background"), 1200)
    created_at = now()
    try:
        number = next_team_number(db, created_at)
    except TeamNumberExhausted as exc:
        raise ServiceError(409, "team_number_exhausted", str(exc)) from exc
    recruitment = Recruitment(
        id=str(uuid4()),
        owner_id=user_id,
        competition=competition,
        team_name=optional_text(data.get("teamName"), 80) or number,
        team_number=number,
        openings=openings,
        background=background,
        requirements=positions,
        created_at=created_at,
        skills=all_skills,
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
        raise invalid("击掌申请类型无效")
    recruitment = db.get(Recruitment, data.get("recruitmentId"))
    if not recruitment or recruitment.competition not in OFFICIAL_COMPETITION_NAMES:
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
        raise ServiceError(409, "conflict", "击掌申请已有不同回应")
    return intent_data(intent, user_id)

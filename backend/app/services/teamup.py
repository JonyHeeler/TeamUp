from datetime import UTC, datetime
from re import fullmatch
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, contains_eager

from app.competitions import OFFICIAL_COMPETITION_NAMES
from app.config import get_settings
from app.db.models import (
    Contact,
    Intent,
    Profile,
    ProfileEvidence,
    Recruitment,
    Skill,
    StudentAccount,
    User,
)
from app.services.evidence import InvalidEvidence, prepare_image
from app.services.team_numbers import TeamNumberExhausted, next_team_number

PROFILE_FIELDS = {
    "college": "college",
    "major": "major",
    "grade": "grade",
    "experience": "experience",
    "competitionIntent": "competition_intent",
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
        if private or (
            value
            and (field in {"college", "major", "grade"} or getattr(profile, "show_" + attribute))
        ):
            result[field] = value
    if private or (profile.show_experience and profile.projects):
        result["projects"] = profile.projects or []
    if private:
        result["publicFields"] = {
            field: getattr(profile, "show_" + attribute)
            for field, attribute in PROFILE_FIELDS.items()
        }
    return result


def get_user(db: Session, user_id: str) -> dict[str, Any]:
    user = db.get(User, user_id)
    if not user:
        raise missing()
    return {"userId": user.id, "nickname": user.nickname}


def active_account(user_id):
    return (
        select(StudentAccount.user_id)
        .where(StudentAccount.user_id == user_id, StudentAccount.status == "active")
        .exists()
    )


def visible_member(db: Session, user_id: str) -> bool:
    return get_settings().auth_mode != "student" or bool(db.scalar(select(active_account(user_id))))


def list_profiles(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
    query = select(Profile)
    if get_settings().auth_mode == "student":
        query = query.where(active_account(Profile.user_id))
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
    if get_settings().auth_mode == "student":
        query = query.where(active_account(ProfileEvidence.user_id))
    image = db.scalar(query)
    if image is None:
        raise missing()
    return image


def get_profile(db: Session, user_id: str, private: bool = False) -> dict[str, Any]:
    profile = db.get(Profile, user_id)
    if not profile or (not private and not visible_member(db, user_id)):
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
    required = {field: text(data.get(field), 80) for field in ("college", "major", "grade")}
    skills = get_skills(db, data.get("skills"))
    custom_skills = list(dict.fromkeys(data.get("customSkills", [])))
    if not skills and not custom_skills:
        raise invalid_field("skills", "请至少选择或填写一项技能")
    optional = {
        field: optional_text(
            data.get(field), 500 if field in {"experience", "competitionIntent"} else 80
        )
        for field in PROFILE_FIELDS
        if field not in required
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
    profile.projects = data["projects"]
    values = {**required, **optional}
    for field, attribute in PROFILE_FIELDS.items():
        setattr(profile, attribute, values[field])
        setattr(
            profile, "show_" + attribute, True if field in required else public.get(field, False)
        )
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
        "isPublished": recruitment.is_published,
        "teamNumber": recruitment.team_number,
        "openings": recruitment.openings,
        "skills": sorted(s.code for s in recruitment.skills),
        "requirements": recruitment.requirements or [],
        "background": recruitment.background,
        "createdAt": timestamp(recruitment.created_at),
    }


def list_recruitments(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
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
    return {
        "competition": competition,
        "openings": openings,
        "requirements": positions,
        "skills": get_skills(db, codes),
        "background": text(data.get("background"), 1200),
        "team_name": optional_text(data.get("teamName"), 80),
    }


def create_recruitment(db: Session, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
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
    query = select(Recruitment).where(Recruitment.owner_id == user_id)
    return [
        recruitment_data(row) for row in db.scalars(query.order_by(Recruitment.created_at.desc()))
    ]


def owned_recruitment(db: Session, user_id: str, recruitment_id: str) -> Recruitment:
    recruitment = db.get(Recruitment, recruitment_id, with_for_update=True)
    if not recruitment:
        raise missing()
    if recruitment.owner_id != user_id:
        raise ServiceError(403, "forbidden", "只有队长可以管理队伍")
    return recruitment


def update_recruitment(
    db: Session, user_id: str, recruitment_id: str, data: dict[str, Any]
) -> dict[str, Any]:
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
    recruitment = owned_recruitment(db, user_id, recruitment_id)
    if is_published and recruitment.competition not in OFFICIAL_COMPETITION_NAMES:
        raise ServiceError(409, "conflict", "请先编辑招募，选择当前赛事后再上架")
    recruitment.is_published = is_published
    db.commit()
    return recruitment_data(recruitment)


def intent_data(
    db: Session, intent: Intent, user_id: str, nicknames: dict[str, str] | None = None
) -> dict[str, Any]:
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
    other_id = (
        intent.candidate_id
        if user_id == intent.recruitment.owner_id
        else intent.recruitment.owner_id
    )
    if nicknames is None:
        counterpart = db.get(User, other_id)
        nickname = counterpart.nickname if counterpart else None
    else:
        nickname = nicknames.get(other_id)
    result["teamName"] = intent.recruitment.team_name
    if nickname:
        result["counterpartNickname"] = nickname
    if intent.responded_at:
        result["respondedAt"] = timestamp(intent.responded_at)
    return result


def list_intents(db: Session, user_id: str) -> list[dict[str, Any]]:
    query = (
        select(Intent)
        .join(Intent.recruitment)
        .options(contains_eager(Intent.recruitment))
        .where(or_(Intent.candidate_id == user_id, Recruitment.owner_id == user_id))
        .order_by(Intent.created_at.desc())
    )
    intents = db.scalars(query).all()
    other_ids = {
        intent.candidate_id
        if user_id == intent.recruitment.owner_id
        else intent.recruitment.owner_id
        for intent in intents
    }
    nicknames = dict(db.execute(select(User.id, User.nickname).where(User.id.in_(other_ids))).all())
    return [intent_data(db, intent, user_id, nicknames) for intent in intents]


def participant_intent(db: Session, user_id: str, intent_id: str) -> Intent:
    intent = db.get(Intent, intent_id)
    if not intent or user_id not in (intent.candidate_id, intent.recruitment.owner_id):
        raise missing()
    return intent


def get_intent(db: Session, user_id: str, intent_id: str) -> dict[str, Any]:
    intent = participant_intent(db, user_id, intent_id)
    result = intent_data(db, intent, user_id)
    if intent.message:
        result["message"] = intent.message
    if intent.status == "accepted":
        other = (
            intent.candidate_id
            if user_id == intent.recruitment.owner_id
            else intent.recruitment.owner_id
        )
        contact = db.get(Contact, other) if visible_member(db, other) else None
        if contact:
            result["counterpartQq"] = contact.qq
    return result


def create_intent(db: Session, user_id: str, data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    kind = data.get("kind")
    if kind not in ("apply", "invite"):
        raise invalid("击掌申请类型无效")
    recruitment = db.get(Recruitment, data.get("recruitmentId"), with_for_update=True)
    if (
        not recruitment
        or recruitment.competition not in OFFICIAL_COMPETITION_NAMES
        or not visible_member(db, recruitment.owner_id)
    ):
        raise missing()
    candidate = user_id if kind == "apply" else data.get("candidateId")
    if not recruitment.is_published:
        raise ServiceError(409, "conflict", "这支队伍的招募已下架")
    if kind == "invite" and recruitment.owner_id != user_id:
        raise ServiceError(403, "forbidden", "只有队长可以邀请")
    if (
        not candidate
        or candidate == recruitment.owner_id
        or not db.get(Profile, candidate)
        or not visible_member(db, candidate)
    ):
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
        message=optional_text(data.get("message"), 300),
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
        return intent_data(db, existing, user_id), False
    return intent_data(db, intent, user_id), True


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
    return intent_data(db, intent, user_id)

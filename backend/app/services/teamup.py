from datetime import UTC, datetime, timedelta
from re import fullmatch
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, delete, or_, select, update
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
    Team,
    TeamInvitation,
    TeamMember,
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


def _team_members_public_data(db: Session, team_id: str) -> list[dict[str, Any]]:
    rows = list(
        db.scalars(
            select(TeamMember)
            .where(TeamMember.team_id == team_id)
            .order_by(TeamMember.joined_at.asc())
        )
    )
    rows.sort(key=lambda m: (0 if m.role == "captain" else 1, m.joined_at))
    if not rows:
        return []
    user_ids = {m.user_id for m in rows}
    nicknames = dict(
        db.execute(select(User.id, User.nickname).where(User.id.in_(user_ids))).all()
    )
    profiles = {
        profile.user_id: profile
        for profile in db.scalars(select(Profile).where(Profile.user_id.in_(user_ids)))
    }
    members: list[dict[str, Any]] = []
    for m in rows:
        profile = profiles.get(m.user_id)
        is_visible = profile is not None and visible_member(db, m.user_id)
        members.append(
            {
                "userId": m.user_id,
                "nickname": nicknames.get(m.user_id, ""),
                "role": m.role,
                "joinedAt": timestamp(m.joined_at),
                "skills": sorted(skill.code for skill in profile.skills) if is_visible else [],
                "customSkills": (profile.custom_skills or []) if is_visible else [],
                "hasProfile": is_visible,
            }
        )
    return members


VALID_RECRUITMENT_DURATIONS = (7, 14, 30)
DEFAULT_RECRUITMENT_DURATION_DAYS = 14


def validate_duration_days(
    raw: Any, *, default: int = DEFAULT_RECRUITMENT_DURATION_DAYS
) -> int:
    if raw is None:
        return default
    if isinstance(raw, bool) or raw not in VALID_RECRUITMENT_DURATIONS:
        raise invalid_field("durationDays", "招募期限仅支持 7、14 或 30 天")
    return int(raw)


def recruitment_lifecycle(
    recruitment: Recruitment,
    team: Team | None = None,
    current_time: datetime | None = None,
) -> tuple[str, bool]:
    checked_at = current_time or now()
    if team is not None and team.status != "active":
        return ("unpublished", False)
    if not recruitment.is_published:
        return ("unpublished", False)
    if recruitment.expires_at is None or checked_at >= recruitment.expires_at:
        return ("expired", False)
    return ("active", True)


def recruitment_data(
    recruitment: Recruitment,
    members: list[dict[str, Any]] | None = None,
    team: Team | None = None,
    current_time: datetime | None = None,
) -> dict[str, Any]:
    status, is_publicly_active = recruitment_lifecycle(recruitment, team, current_time)
    result: dict[str, Any] = {
        "id": recruitment.id,
        "teamId": recruitment.team_id,
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
        "status": status,
        "isPubliclyActive": is_publicly_active,
        "publishedAt": timestamp(recruitment.published_at) if recruitment.published_at else None,
        "expiresAt": timestamp(recruitment.expires_at) if recruitment.expires_at else None,
        "durationDays": recruitment.duration_days,
    }
    if members is not None:
        result["memberCount"] = len(members)
        result["members"] = members
    return result


def list_recruitments(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
    current_time = now()
    query = (
        select(Recruitment)
        .join(Team, Team.id == Recruitment.team_id)
        .where(
            Team.status == "active",
            Recruitment.is_published.is_(True),
            Recruitment.expires_at.is_not(None),
            Recruitment.expires_at > current_time,
            Recruitment.competition.collate("utf8mb4_bin").in_(OFFICIAL_COMPETITION_NAMES),
        )
    )
    if get_settings().auth_mode == "student":
        query = query.where(active_account(Recruitment.owner_id))
    if skill:
        query = query.where(Recruitment.skills.any(Skill.code == skill))
    rows = list(db.scalars(query.order_by(Recruitment.created_at.desc())))
    return [
        recruitment_data(
            r, _team_members_public_data(db, r.team_id), current_time=current_time
        )
        for r in rows
    ]


def get_recruitment(db: Session, recruitment_id: str) -> dict[str, Any]:
    current_time = now()
    recruitment = db.get(Recruitment, recruitment_id)
    team = db.get(Team, recruitment.team_id) if recruitment else None
    if (
        not recruitment
        or not team
        or not recruitment_lifecycle(recruitment, team, current_time)[1]
        or recruitment.competition not in OFFICIAL_COMPETITION_NAMES
        or not visible_member(db, recruitment.owner_id)
    ):
        raise missing()
    return recruitment_data(
        recruitment,
        _team_members_public_data(db, recruitment.team_id),
        team=team,
        current_time=current_time,
    )


def recruitment_fields(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    competition = text(data.get("competition"), 80)
    if competition not in OFFICIAL_COMPETITION_NAMES:
        message = "请选择官方比赛"
        raise ServiceError(422, "validation_error", message, {"competition": message})
    openings = optional_text(data.get("openings"), 40)
    requirements = data.get("requirements") or []
    if not isinstance(requirements, list) or len(requirements) > 100:
        raise invalid_field("requirements", "招募需求列表格式无效或超出上限")
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
    team_id = str(uuid4())
    team = Team(
        id=team_id,
        captain_id=user_id,
        competition=fields["competition"],
        team_name=fields["team_name"],
        team_number=number,
        description=fields["background"],
        status="active",
        created_at=created_at,
    )
    db.add(team)
    db.flush()
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=user_id,
            role="captain",
            joined_at=created_at,
        )
    )
    duration_days = validate_duration_days(data.get("durationDays"))
    recruitment = Recruitment(
        id=team_id,
        team_id=team.id,
        owner_id=user_id,
        team_number=number,
        published_at=created_at,
        expires_at=created_at + timedelta(days=duration_days),
        duration_days=duration_days,
        created_at=created_at,
        **fields,
    )
    db.add(recruitment)
    db.commit()
    return recruitment_data(recruitment)


def list_own_recruitments(db: Session, user_id: str) -> list[dict[str, Any]]:
    query = (
        select(Recruitment)
        .join(Team, Team.id == Recruitment.team_id)
        .where(Recruitment.owner_id == user_id, Team.status == "active")
    )
    return [
        recruitment_data(row, _team_members_public_data(db, row.team_id))
        for row in db.scalars(query.order_by(Recruitment.created_at.desc()))
    ]


def owned_recruitment(db: Session, user_id: str, recruitment_id: str) -> Recruitment:
    recruitment = db.get(Recruitment, recruitment_id, with_for_update=True)
    if not recruitment:
        raise missing()
    team = db.get(Team, recruitment.team_id, with_for_update=True)
    if not team or team.status != "active":
        raise ServiceError(409, "conflict", "该队伍已解散，无法继续管理招募")
    member = db.get(TeamMember, (team.id, user_id))
    if member is None or member.role != "captain":
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
    team = db.get(Team, recruitment.team_id)
    if team is not None:
        team.competition = recruitment.competition
        team.team_name = recruitment.team_name
        team.description = recruitment.background
    db.commit()
    return recruitment_data(recruitment)


def set_recruitment_visibility(
    db: Session,
    user_id: str,
    recruitment_id: str,
    is_published: bool,
    duration_days: int | None = None,
) -> dict[str, Any]:
    recruitment = owned_recruitment(db, user_id, recruitment_id)
    current_time = now()
    if is_published:
        if recruitment.competition not in OFFICIAL_COMPETITION_NAMES:
            raise ServiceError(409, "conflict", "请先编辑招募，选择当前赛事后再上架")
        days = validate_duration_days(duration_days)
        recruitment.is_published = True
        recruitment.published_at = current_time
        recruitment.expires_at = current_time + timedelta(days=days)
        recruitment.duration_days = days
    else:
        recruitment.is_published = False
    db.commit()
    return recruitment_data(
        recruitment,
        _team_members_public_data(db, recruitment.team_id),
        current_time=current_time,
    )


def republish_recruitment(
    db: Session, user_id: str, recruitment_id: str, duration_days: int = 14
) -> dict[str, Any]:
    recruitment = owned_recruitment(db, user_id, recruitment_id)
    if recruitment.competition not in OFFICIAL_COMPETITION_NAMES:
        raise ServiceError(409, "conflict", "请先编辑招募，选择当前赛事后再重新发布")
    current_time = now()
    status, _ = recruitment_lifecycle(recruitment, current_time=current_time)
    if status == "active":
        raise ServiceError(409, "conflict", "招募当前正在进行中，如需延长期限请使用续期")
    days = validate_duration_days(duration_days)
    recruitment.is_published = True
    recruitment.published_at = current_time
    recruitment.expires_at = current_time + timedelta(days=days)
    recruitment.duration_days = days
    db.commit()
    return recruitment_data(
        recruitment,
        _team_members_public_data(db, recruitment.team_id),
        current_time=current_time,
    )


def renew_recruitment(
    db: Session,
    user_id: str,
    recruitment_id: str,
    duration_days: int = 14,
    expected_expires_at: datetime | None = None,
) -> dict[str, Any]:
    recruitment = owned_recruitment(db, user_id, recruitment_id)
    current_time = now()
    status, is_active = recruitment_lifecycle(recruitment, current_time=current_time)
    if not is_active or recruitment.expires_at is None:
        raise ServiceError(
            409,
            "conflict",
            "招募已到期或已下架，请使用重新发布功能" if status != "active" else "招募状态无效",
        )
    if expected_expires_at is not None:
        expected_naive = (
            expected_expires_at.astimezone(UTC).replace(tzinfo=None)
            if expected_expires_at.tzinfo is not None
            else expected_expires_at
        )
        if abs((recruitment.expires_at - expected_naive).total_seconds()) > 1e-3:
            raise ServiceError(409, "conflict", "招募有效期已更新，请刷新后重试")
    days = validate_duration_days(duration_days)
    recruitment.expires_at = recruitment.expires_at + timedelta(days=days)
    recruitment.duration_days = days
    db.commit()
    return recruitment_data(
        recruitment,
        _team_members_public_data(db, recruitment.team_id),
        current_time=current_time,
    )


INTENT_TTL = timedelta(days=7)


def make_personal_pair_key(first_user_id: str, second_user_id: str) -> str:
    left, right = sorted((first_user_id, second_user_id))
    return f"{left}:{right}"


def make_active_relation_key(
    kind: str,
    sender_id: str,
    recipient_id: str,
    recruitment_id: str | None = None,
) -> str:
    if kind == "personal":
        return f"p:{make_personal_pair_key(sender_id, recipient_id)}"
    candidate_id = sender_id if kind == "apply" else recipient_id
    return f"r:{recruitment_id}:{candidate_id}"


def is_intent_expired(intent: Intent, current_time: datetime) -> bool:
    return current_time >= intent.expires_at


def intent_data(
    db: Session,
    intent: Intent,
    user_id: str,
    nicknames: dict[str, str] | None = None,
    current_time: datetime | None = None,
) -> dict[str, Any]:
    checked_at = current_time or now()
    expired = is_intent_expired(intent, checked_at)
    result: dict[str, Any] = {
        "id": intent.id,
        "candidateId": intent.candidate_id,
        "senderId": intent.sender_id,
        "recipientId": intent.recipient_id,
        "kind": intent.kind,
        "status": intent.status,
        "createdAt": timestamp(intent.created_at),
        "expiresAt": timestamp(intent.expires_at),
        "isExpired": expired,
        "canRespond": intent.status == "pending" and not expired and user_id == intent.recipient_id,
    }
    if intent.recruitment_id and intent.recruitment:
        result["recruitmentId"] = intent.recruitment_id
        result["ownerId"] = intent.recruitment.owner_id
        result["teamName"] = intent.recruitment.team_name
    other_id = intent.recipient_id if user_id == intent.sender_id else intent.sender_id
    if nicknames is None:
        counterpart = db.get(User, other_id)
        nickname = counterpart.nickname if counterpart else None
    else:
        nickname = nicknames.get(other_id)
    if nickname:
        result["counterpartNickname"] = nickname
    if intent.responded_at:
        result["respondedAt"] = timestamp(intent.responded_at)
    return result


def list_intents(db: Session, user_id: str) -> list[dict[str, Any]]:
    current_time = now()
    query = (
        select(Intent)
        .outerjoin(Intent.recruitment)
        .options(contains_eager(Intent.recruitment))
        .where(
            or_(Intent.sender_id == user_id, Intent.recipient_id == user_id),
            Intent.expires_at > current_time,
        )
        .order_by(Intent.created_at.desc())
    )
    intents = db.scalars(query).all()
    other_ids = {
        intent.recipient_id if user_id == intent.sender_id else intent.sender_id
        for intent in intents
    }
    nicknames = (
        dict(db.execute(select(User.id, User.nickname).where(User.id.in_(other_ids))).all())
        if other_ids
        else {}
    )
    return [
        intent_data(db, intent, user_id, nicknames, current_time=current_time)
        for intent in intents
    ]


def list_valid_candidates(
    db: Session,
    user_id: str,
    recruitment_id: str | None = None,
    team_id: str | None = None,
) -> list[dict[str, Any]]:
    current_time = now()
    existing_member_ids: set[str] = set()
    resolved_recruitment_id = recruitment_id
    if team_id is not None:
        team = db.get(Team, team_id)
        if not team or team.status != "active":
            raise missing()
        if team.captain_id != user_id:
            raise ServiceError(403, "forbidden", "只有队长可以查看该队伍的有效击掌候选对象")
        existing_member_ids = set(
            db.scalars(select(TeamMember.user_id).where(TeamMember.team_id == team.id))
        )
        linked = db.scalar(select(Recruitment).where(Recruitment.team_id == team.id))
        resolved_recruitment_id = linked.id if linked else None
    elif recruitment_id is not None:
        recruitment = db.get(Recruitment, recruitment_id)
        if not recruitment:
            raise missing()
        if recruitment.owner_id != user_id:
            raise ServiceError(403, "forbidden", "只有队长可以查看该队伍的有效击掌候选对象")
        existing_member_ids = set(
            db.scalars(
                select(TeamMember.user_id).where(TeamMember.team_id == recruitment.team_id)
            )
        )

    if resolved_recruitment_id is not None:
        relation_filter = or_(
            and_(
                Intent.kind == "personal",
                or_(Intent.sender_id == user_id, Intent.recipient_id == user_id),
            ),
            and_(
                Intent.kind.in_(("invite", "apply")),
                Intent.recruitment_id == resolved_recruitment_id,
            ),
        )
    else:
        relation_filter = and_(
            Intent.kind == "personal",
            or_(Intent.sender_id == user_id, Intent.recipient_id == user_id),
        )

    query = (
        select(Intent)
        .outerjoin(Intent.recruitment)
        .options(contains_eager(Intent.recruitment))
        .where(
            Intent.status == "accepted",
            Intent.expires_at > current_time,
            relation_filter,
        )
        .order_by(Intent.expires_at.desc())
    )
    valid_intents = db.scalars(query).all()
    grouped: dict[str, dict[str, Any]] = {}
    for entry in valid_intents:
        other_id = entry.recipient_id if user_id == entry.sender_id else entry.sender_id
        if other_id == user_id or other_id in existing_member_ids:
            continue
        source: dict[str, Any] = {
            "intentId": entry.id,
            "kind": entry.kind,
            "expiresAt": timestamp(entry.expires_at),
        }
        if entry.recruitment_id and entry.recruitment:
            source["recruitmentId"] = entry.recruitment_id
            source["teamName"] = entry.recruitment.team_name
        bucket = grouped.get(other_id)
        if bucket is None:
            grouped[other_id] = {
                "max_expires": entry.expires_at,
                "sources": [source],
            }
        else:
            bucket["max_expires"] = max(bucket["max_expires"], entry.expires_at)
            bucket["sources"].append(source)

    if not grouped:
        return []

    profiles = {
        profile.user_id: profile
        for profile in db.scalars(select(Profile).where(Profile.user_id.in_(grouped.keys())))
    }
    candidates: list[dict[str, Any]] = []
    for other_id, bucket in grouped.items():
        profile = profiles.get(other_id)
        if not profile or not visible_member(db, other_id):
            continue
        candidates.append(
            {
                "userId": other_id,
                "nickname": profile.user.nickname,
                "skills": sorted(skill.code for skill in profile.skills),
                "customSkills": profile.custom_skills or [],
                "expiresAt": timestamp(bucket["max_expires"]),
                "sources": bucket["sources"],
            }
        )
    return candidates


def participant_intent(db: Session, user_id: str, intent_id: str) -> Intent:
    intent = db.get(Intent, intent_id)
    if not intent or user_id not in (intent.sender_id, intent.recipient_id):
        raise missing()
    return intent


def verified_personal_pairing(
    db: Session,
    user_id: str,
    personal_intent_id: str,
    candidate_id: str | None = None,
    current_time: datetime | None = None,
) -> Intent:
    checked_at = current_time or now()
    pairing = participant_intent(db, user_id, personal_intent_id)
    if pairing.kind != "personal":
        raise ServiceError(409, "conflict", "仅支持从个人击掌发起后续队伍击掌")
    if pairing.sender_id != user_id:
        raise ServiceError(403, "forbidden", "只有原个人击掌发送方可以发起后续队伍击掌")
    if pairing.status != "accepted":
        raise ServiceError(409, "conflict", "仅已同意的个人击掌可发起后续队伍击掌")
    if is_intent_expired(pairing, checked_at):
        raise ServiceError(409, "expired", "该个人击掌已超过 7 天有效期，请重新发起击掌")
    if candidate_id is not None and pairing.recipient_id != candidate_id:
        raise invalid("击掌对象必须与原个人击掌对象一致")
    return pairing


def get_intent(db: Session, user_id: str, intent_id: str) -> dict[str, Any]:
    current_time = now()
    intent = participant_intent(db, user_id, intent_id)
    result = intent_data(db, intent, user_id, current_time=current_time)
    if intent.message:
        result["message"] = intent.message
    if intent.response_message:
        result["responseMessage"] = intent.response_message
    if intent.status == "accepted" and not is_intent_expired(intent, current_time):
        other = intent.recipient_id if user_id == intent.sender_id else intent.sender_id
        contact = db.get(Contact, other) if visible_member(db, other) else None
        if contact:
            result["counterpartQq"] = contact.qq
    return result


def _resolve_active_relation(
    db: Session,
    user_id: str,
    rel_key: str,
    current_time: datetime,
) -> dict[str, Any] | None:
    existing = db.scalar(
        select(Intent).where(Intent.active_relation_key == rel_key).with_for_update()
    )
    if existing is None:
        return None
    if current_time < existing.expires_at:
        if existing.status == "declined":
            raise ServiceError(
                409,
                "cooldown",
                "该击掌已被婉拒，7 天冷却期内暂不可重新发起",
            )
        return intent_data(db, existing, user_id, current_time=current_time)
    existing.active_relation_key = None
    db.flush()
    return None


def create_intent(db: Session, user_id: str, data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    kind = data.get("kind")
    if kind not in ("apply", "invite", "personal"):
        raise invalid("击掌申请类型无效")
    current_time = now()
    if kind == "personal":
        if get_settings().auth_mode == "student":
            account = db.get(StudentAccount, user_id)
            if not account or account.status != "active":
                raise ServiceError(403, "forbidden", "该账号无法发起个人击掌")
        candidate = data.get("candidateId")
        if (
            not candidate
            or candidate == user_id
            or not db.get(User, user_id)
            or not db.get(Profile, candidate)
            or not visible_member(db, candidate)
        ):
            raise invalid("候选人无效或尚未发布名片")
        if not db.scalar(select(Contact.user_id).where(Contact.user_id == candidate)) or not db.scalar(
            select(Contact.user_id).where(Contact.user_id == user_id)
        ):
            raise invalid("双方均需有联系方式")
        pair_key = make_personal_pair_key(user_id, candidate)
        rel_key = make_active_relation_key("personal", user_id, candidate)
        existing_data = _resolve_active_relation(db, user_id, rel_key, current_time)
        if existing_data is not None:
            return existing_data, False
        intent = Intent(
            id=str(uuid4()),
            recruitment_id=None,
            candidate_id=candidate,
            sender_id=user_id,
            recipient_id=candidate,
            personal_pair_key=pair_key,
            active_relation_key=rel_key,
            kind="personal",
            message=optional_text(data.get("message"), 300),
            status="pending",
            created_at=current_time,
            expires_at=current_time + INTENT_TTL,
        )
        db.add(intent)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            if not (
                exc.orig.args
                and exc.orig.args[0] == 1062
                and "uq_intent_active_relation" in str(exc.orig)
            ):
                raise
            existing = db.scalar(select(Intent).where(Intent.active_relation_key == rel_key))
            if not existing:
                raise
            if existing.status == "declined" and current_time < existing.expires_at:
                raise ServiceError(
                    409,
                    "cooldown",
                    "该击掌已被婉拒，7 天冷却期内暂不可重新发起",
                ) from exc
            return intent_data(db, existing, user_id, current_time=current_time), False
        return intent_data(db, intent, user_id, current_time=current_time), True

    recruitment = db.get(Recruitment, data.get("recruitmentId"), with_for_update=True)
    if (
        not recruitment
        or recruitment.competition not in OFFICIAL_COMPETITION_NAMES
        or not visible_member(db, recruitment.owner_id)
    ):
        raise missing()
    candidate = user_id if kind == "apply" else data.get("candidateId")
    team_entity = db.get(Team, recruitment.team_id)
    rec_status, rec_active = recruitment_lifecycle(recruitment, team_entity, current_time)
    if not rec_active:
        if rec_status == "expired":
            raise ServiceError(409, "expired", "该招募已到期，暂无法发起新的击掌")
        raise ServiceError(409, "conflict", "这支队伍的招募已下架")
    if kind == "invite" and recruitment.owner_id != user_id:
        raise ServiceError(403, "forbidden", "只有队长可以代表队伍发起击掌")
    if (
        not candidate
        or candidate == recruitment.owner_id
        or not db.get(Profile, candidate)
        or not visible_member(db, candidate)
    ):
        raise invalid("候选人无效或尚未发布名片")
    if kind == "invite" and data.get("sourcePersonalIntentId"):
        verified_personal_pairing(
            db,
            user_id,
            str(data["sourcePersonalIntentId"]),
            candidate,
            current_time=current_time,
        )
    if not db.scalar(select(Contact.user_id).where(Contact.user_id == candidate)) or not db.scalar(
        select(Contact.user_id).where(Contact.user_id == recruitment.owner_id)
    ):
        raise invalid("双方均需有联系方式")
    sender_id = candidate if kind == "apply" else recruitment.owner_id
    recipient_id = recruitment.owner_id if kind == "apply" else candidate
    rel_key = make_active_relation_key(kind, sender_id, recipient_id, recruitment.id)
    existing_data = _resolve_active_relation(db, user_id, rel_key, current_time)
    if existing_data is not None:
        return existing_data, False
    intent = Intent(
        id=str(uuid4()),
        recruitment_id=recruitment.id,
        candidate_id=candidate,
        sender_id=sender_id,
        recipient_id=recipient_id,
        personal_pair_key=None,
        active_relation_key=rel_key,
        kind=kind,
        message=optional_text(data.get("message"), 300),
        status="pending",
        created_at=current_time,
        expires_at=current_time + INTENT_TTL,
    )
    db.add(intent)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if not (
            exc.orig.args
            and exc.orig.args[0] == 1062
            and "uq_intent_active_relation" in str(exc.orig)
        ):
            raise
        existing = db.scalar(select(Intent).where(Intent.active_relation_key == rel_key))
        if not existing:
            raise
        if existing.status == "declined" and current_time < existing.expires_at:
            raise ServiceError(
                409,
                "cooldown",
                "该击掌已被婉拒，7 天冷却期内暂不可重新发起",
            ) from exc
        return intent_data(db, existing, user_id, current_time=current_time), False
    return intent_data(db, intent, user_id, current_time=current_time), True


def create_team_and_invite(
    db: Session,
    user_id: str,
    personal_intent_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    current_time = now()
    pairing = verified_personal_pairing(
        db, user_id, personal_intent_id, current_time=current_time
    )
    candidate_id = pairing.recipient_id
    if get_settings().auth_mode == "student":
        account = db.get(StudentAccount, user_id, with_for_update=True)
        if not account or account.status != "active":
            raise ServiceError(403, "forbidden", "该账号无法发布招募")
        if not db.get(Contact, user_id):
            raise invalid("请先在个人名片中填写 QQ，再发布招募")
    if (
        candidate_id == user_id
        or not db.get(Profile, candidate_id)
        or not visible_member(db, candidate_id)
    ):
        raise invalid("候选人无效或尚未发布名片")
    if not db.scalar(select(Contact.user_id).where(Contact.user_id == candidate_id)) or not db.scalar(
        select(Contact.user_id).where(Contact.user_id == user_id)
    ):
        raise invalid("双方均需有联系方式")
    fields = recruitment_fields(db, data)
    invite_message = optional_text(data.get("message"), 300)
    try:
        number = next_team_number(db, current_time)
    except TeamNumberExhausted as exc:
        raise ServiceError(409, "team_number_exhausted", str(exc)) from exc
    fields["team_name"] = fields["team_name"] or number
    team_id = str(uuid4())
    team = Team(
        id=team_id,
        captain_id=user_id,
        competition=fields["competition"],
        team_name=fields["team_name"],
        team_number=number,
        description=fields["background"],
        status="active",
        created_at=current_time,
    )
    db.add(team)
    db.flush()
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=user_id,
            role="captain",
            joined_at=current_time,
        )
    )
    duration_days = validate_duration_days(data.get("durationDays"))
    recruitment = Recruitment(
        id=team_id,
        team_id=team.id,
        owner_id=user_id,
        team_number=number,
        published_at=current_time,
        expires_at=current_time + timedelta(days=duration_days),
        duration_days=duration_days,
        created_at=current_time,
        **fields,
    )
    db.add(recruitment)
    db.flush()
    rel_key = make_active_relation_key("invite", user_id, candidate_id, recruitment.id)
    new_intent = Intent(
        id=str(uuid4()),
        recruitment_id=recruitment.id,
        candidate_id=candidate_id,
        sender_id=user_id,
        recipient_id=candidate_id,
        personal_pair_key=None,
        active_relation_key=rel_key,
        kind="invite",
        message=invite_message,
        status="pending",
        created_at=current_time,
        expires_at=current_time + INTENT_TTL,
    )
    new_intent.recruitment = recruitment
    db.add(new_intent)
    db.commit()
    return {
        "recruitment": recruitment_data(recruitment),
        "intent": intent_data(db, new_intent, user_id, current_time=current_time),
    }


def respond_intent(
    db: Session,
    user_id: str,
    intent_id: str,
    decision: str,
    response_message: str | None = None,
) -> dict[str, Any]:
    if decision not in ("accepted", "declined"):
        raise invalid("回应无效")
    cleaned_response = optional_text(response_message, 300)
    current_time = now()
    intent = participant_intent(db, user_id, intent_id)
    if intent.recipient_id != user_id:
        raise ServiceError(403, "forbidden", "只有收件人可以回应")
    if intent.status == "pending" and is_intent_expired(intent, current_time):
        raise ServiceError(409, "expired", "该击掌已超过 7 天待回应期限，无法继续处理")
    result = db.execute(
        update(Intent)
        .where(
            Intent.id == intent_id,
            Intent.status == "pending",
            Intent.expires_at > current_time,
        )
        .values(
            status=decision,
            responded_at=current_time,
            expires_at=current_time + INTENT_TTL,
            response_message=cleaned_response,
        )
        .execution_options(synchronize_session=False)
    )
    db.commit()
    db.expire_all()
    intent = db.get(Intent, intent_id)
    if result.rowcount == 0:
        if intent.status == "pending":
            raise ServiceError(409, "expired", "该击掌已超过 7 天待回应期限，无法继续处理")
        if intent.status != decision:
            raise ServiceError(409, "conflict", "击掌申请已有不同回应")
    return intent_data(db, intent, user_id, current_time=current_time)


TEAM_INVITATION_TTL = timedelta(days=7)


def make_team_invite_key(team_id: str, invitee_id: str) -> str:
    return f"{team_id}:{invitee_id}"


def team_summary_data(
    db: Session, team: Team, user_id: str, my_role: str | None = None
) -> dict[str, Any]:
    members = _team_members_public_data(db, team.id)
    role = my_role or next(
        (m["role"] for m in members if m["userId"] == user_id),
        "captain" if team.captain_id == user_id else "member",
    )
    linked = db.scalar(select(Recruitment).where(Recruitment.team_id == team.id))
    result: dict[str, Any] = {
        "id": team.id,
        "captainId": team.captain_id,
        "competition": team.competition,
        "teamName": team.team_name,
        "teamNumber": team.team_number,
        "description": team.description,
        "status": team.status,
        "createdAt": timestamp(team.created_at),
        "myRole": role,
        "memberCount": len(members),
        "members": members,
    }
    if linked is not None:
        result["recruitment"] = recruitment_data(linked, members)
    return result


def team_invitation_data(
    db: Session,
    invitation: TeamInvitation,
    user_id: str,
    nicknames: dict[str, str] | None = None,
    current_time: datetime | None = None,
) -> dict[str, Any]:
    checked_at = current_time or now()
    expired = checked_at >= invitation.expires_at
    team = invitation.team or db.get(Team, invitation.team_id)
    if nicknames is None:
        inviter = db.get(User, invitation.inviter_id)
        invitee = db.get(User, invitation.invitee_id)
        inviter_name = inviter.nickname if inviter else None
        invitee_name = invitee.nickname if invitee else None
    else:
        inviter_name = nicknames.get(invitation.inviter_id)
        invitee_name = nicknames.get(invitation.invitee_id)
    result: dict[str, Any] = {
        "id": invitation.id,
        "teamId": invitation.team_id,
        "teamName": team.team_name if team else "",
        "competition": team.competition if team else "",
        "inviterId": invitation.inviter_id,
        "inviteeId": invitation.invitee_id,
        "status": invitation.status,
        "createdAt": timestamp(invitation.created_at),
        "expiresAt": timestamp(invitation.expires_at),
        "isExpired": expired,
        "canRespond": (
            invitation.status == "pending"
            and not expired
            and team is not None
            and team.status == "active"
            and user_id == invitation.invitee_id
        ),
    }
    if inviter_name:
        result["inviterNickname"] = inviter_name
    if invitee_name:
        result["inviteeNickname"] = invitee_name
    if invitation.message:
        result["message"] = invitation.message
    if invitation.response_message:
        result["responseMessage"] = invitation.response_message
    if invitation.responded_at:
        result["respondedAt"] = timestamp(invitation.responded_at)
    return result


def list_my_teams(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Team, TeamMember.role)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user_id, Team.status == "active")
        .order_by(TeamMember.joined_at.desc())
    ).all()
    return [team_summary_data(db, team, user_id, my_role=role) for team, role in rows]


def _prepare_team_invitation(
    db: Session,
    team: Team,
    captain_id: str,
    invitee_id: str,
    message: str | None,
    current_time: datetime,
) -> TeamInvitation:
    if (
        invitee_id == captain_id
        or not db.get(User, invitee_id)
        or not db.get(Profile, invitee_id)
        or not visible_member(db, invitee_id)
    ):
        raise invalid("被邀请用户无效或尚未发布公开名片")
    if db.get(TeamMember, (team.id, invitee_id)) is not None:
        raise ServiceError(409, "already_member", "该用户已经是队伍正式成员")
    inv_key = make_team_invite_key(team.id, invitee_id)
    existing = db.scalar(
        select(TeamInvitation)
        .where(TeamInvitation.active_invite_key == inv_key)
        .with_for_update()
    )
    if existing is not None:
        if current_time < existing.expires_at:
            if existing.status == "declined":
                raise ServiceError(
                    409,
                    "cooldown",
                    "对方已拒绝该队伍邀请，7 天冷却期内暂不可重复邀请",
                )
            return existing
        existing.active_invite_key = None
        db.flush()
    invitation = TeamInvitation(
        id=str(uuid4()),
        team_id=team.id,
        inviter_id=captain_id,
        invitee_id=invitee_id,
        status="pending",
        message=message,
        created_at=current_time,
        expires_at=current_time + TEAM_INVITATION_TTL,
        active_invite_key=inv_key,
    )
    invitation.team = team
    db.add(invitation)
    return invitation


def create_team(db: Session, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    if get_settings().auth_mode == "student":
        account = db.get(StudentAccount, user_id, with_for_update=True)
        if not account or account.status != "active":
            raise ServiceError(403, "forbidden", "该账号无法创建队伍")
    competition = text(data.get("competition"), 80)
    if competition not in OFFICIAL_COMPETITION_NAMES:
        message = "请选择官方比赛"
        raise ServiceError(422, "validation_error", message, {"competition": message})
    description = text(data.get("description"), 1200)
    custom_name = optional_text(data.get("teamName"), 80)
    publish_recruitment = bool(data.get("publishRecruitment", False))
    invite_message = optional_text(data.get("inviteMessage"), 300)
    raw_invitees = list(dict.fromkeys(str(item) for item in (data.get("inviteeIds") or [])))
    if len(raw_invitees) > 20:
        raise invalid_field("inviteeIds", "单次最多邀请 20 位用户")

    rec_fields = (
        recruitment_fields(
            db,
            {
                "competition": competition,
                "teamName": custom_name,
                "openings": data.get("openings"),
                "requirements": data.get("requirements") or [],
                "background": description,
            },
        )
        if publish_recruitment
        else None
    )

    current_time = now()
    try:
        number = next_team_number(db, current_time)
    except TeamNumberExhausted as exc:
        raise ServiceError(409, "team_number_exhausted", str(exc)) from exc
    team_name = custom_name or number
    team_id = str(uuid4())
    team = Team(
        id=team_id,
        captain_id=user_id,
        competition=competition,
        team_name=team_name,
        team_number=number,
        description=description,
        status="active",
        created_at=current_time,
    )
    db.add(team)
    db.flush()
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=user_id,
            role="captain",
            joined_at=current_time,
        )
    )
    recruitment = None
    if rec_fields is not None:
        duration_days = validate_duration_days(data.get("durationDays"))
        rec_fields["team_name"] = team_name
        recruitment = Recruitment(
            id=team_id,
            team_id=team.id,
            owner_id=user_id,
            team_number=number,
            is_published=True,
            published_at=current_time,
            expires_at=current_time + timedelta(days=duration_days),
            duration_days=duration_days,
            created_at=current_time,
            **rec_fields,
        )
        db.add(recruitment)
        db.flush()

    invitations = [
        _prepare_team_invitation(db, team, user_id, invitee_id, invite_message, current_time)
        for invitee_id in raw_invitees
    ]
    db.commit()
    result: dict[str, Any] = {
        "team": team_summary_data(db, team, user_id, my_role="captain"),
        "invitations": [
            team_invitation_data(db, inv, user_id, current_time=current_time)
            for inv in invitations
        ],
    }
    if recruitment is not None:
        result["recruitment"] = recruitment_data(recruitment)
    return result


def upsert_team_recruitment(
    db: Session, user_id: str, team_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    team = _require_active_captain_team(db, user_id, team_id)
    fields = recruitment_fields(db, data)
    fields["team_name"] = fields["team_name"] or team.team_number
    team.competition = fields["competition"]
    team.team_name = fields["team_name"]
    team.description = fields["background"]
    recruitment = db.scalar(select(Recruitment).where(Recruitment.team_id == team.id))
    if recruitment is None:
        current_time = now()
        duration_days = validate_duration_days(data.get("durationDays"))
        recruitment = Recruitment(
            id=team.id,
            team_id=team.id,
            owner_id=user_id,
            team_number=team.team_number,
            is_published=True,
            published_at=current_time,
            expires_at=current_time + timedelta(days=duration_days),
            duration_days=duration_days,
            created_at=current_time,
            **fields,
        )
        db.add(recruitment)
    else:
        for field, value in fields.items():
            setattr(recruitment, field, value)
    db.commit()
    return recruitment_data(recruitment, _team_members_public_data(db, team.id))


def create_team_invitations(
    db: Session,
    user_id: str,
    team_id: str,
    invitee_ids: list[str],
    message: str | None = None,
) -> list[dict[str, Any]]:
    team = _require_active_captain_team(db, user_id, team_id)
    cleaned_message = optional_text(message, 300)
    unique_invitees = list(dict.fromkeys(str(item) for item in invitee_ids))
    if not unique_invitees or len(unique_invitees) > 20:
        raise invalid_field("inviteeIds", "请选择 1 至 20 位被邀请用户")
    current_time = now()
    created: list[TeamInvitation] = []
    for invitee_id in unique_invitees:
        created.append(
            _prepare_team_invitation(db, team, user_id, invitee_id, cleaned_message, current_time)
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if not (
            exc.orig.args
            and exc.orig.args[0] == 1062
            and "uq_team_invitation_active" in str(exc.orig)
        ):
            raise
        resolved: list[TeamInvitation] = []
        for invitee_id in unique_invitees:
            inv = db.scalar(
                select(TeamInvitation).where(
                    TeamInvitation.active_invite_key == make_team_invite_key(team.id, invitee_id)
                )
            )
            if inv is not None:
                resolved.append(inv)
        return [
            team_invitation_data(db, inv, user_id, current_time=current_time) for inv in resolved
        ]
    return [team_invitation_data(db, inv, user_id, current_time=current_time) for inv in created]


def list_team_invitations(db: Session, user_id: str) -> list[dict[str, Any]]:
    current_time = now()
    rows = db.scalars(
        select(TeamInvitation)
        .join(TeamInvitation.team)
        .options(contains_eager(TeamInvitation.team))
        .where(
            or_(TeamInvitation.inviter_id == user_id, TeamInvitation.invitee_id == user_id),
            TeamInvitation.expires_at > current_time,
        )
        .order_by(TeamInvitation.created_at.desc())
    ).all()
    user_ids = {inv.inviter_id for inv in rows} | {inv.invitee_id for inv in rows}
    nicknames = (
        dict(db.execute(select(User.id, User.nickname).where(User.id.in_(user_ids))).all())
        if user_ids
        else {}
    )
    return [
        team_invitation_data(db, inv, user_id, nicknames, current_time=current_time)
        for inv in rows
    ]


def get_team_invitation(db: Session, user_id: str, invitation_id: str) -> dict[str, Any]:
    current_time = now()
    invitation = db.get(TeamInvitation, invitation_id)
    if not invitation or user_id not in (invitation.inviter_id, invitation.invitee_id):
        raise missing()
    return team_invitation_data(db, invitation, user_id, current_time=current_time)


def _require_active_captain_team(db: Session, user_id: str, team_id: str) -> Team:
    team = db.get(Team, team_id, with_for_update=True)
    if not team:
        raise missing()
    if team.status != "active":
        raise ServiceError(409, "conflict", "该队伍已解散")
    member = db.get(TeamMember, (team.id, user_id))
    if member is None or member.role != "captain":
        raise ServiceError(403, "forbidden", "只有队长可以管理该队伍")
    return team


def update_team(
    db: Session, user_id: str, team_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    team = _require_active_captain_team(db, user_id, team_id)
    competition = text(data.get("competition"), 80)
    if competition not in OFFICIAL_COMPETITION_NAMES:
        message = "请选择官方比赛"
        raise ServiceError(422, "validation_error", message, {"competition": message})
    description = text(data.get("description"), 1200)
    team_name = optional_text(data.get("teamName"), 80) or team.team_number
    team.competition = competition
    team.team_name = team_name
    team.description = description
    linked = db.scalar(select(Recruitment).where(Recruitment.team_id == team.id))
    if linked is not None:
        linked.competition = competition
        linked.team_name = team_name
        linked.background = description
    db.commit()
    return team_summary_data(db, team, user_id, my_role="captain")


def list_team_invitations_for_team(
    db: Session, user_id: str, team_id: str
) -> list[dict[str, Any]]:
    team = db.get(Team, team_id)
    if not team or team.status != "active":
        raise missing()
    member = db.get(TeamMember, (team.id, user_id))
    if member is None or member.role != "captain":
        raise ServiceError(403, "forbidden", "只有队长可以查看队伍正式邀请")
    current_time = now()
    recent_cutoff = current_time - TEAM_INVITATION_TTL
    rows = db.scalars(
        select(TeamInvitation)
        .join(TeamInvitation.team)
        .options(contains_eager(TeamInvitation.team))
        .where(
            TeamInvitation.team_id == team.id,
            TeamInvitation.expires_at > recent_cutoff,
        )
        .order_by(TeamInvitation.created_at.desc())
    ).all()
    user_ids = {inv.inviter_id for inv in rows} | {inv.invitee_id for inv in rows}
    nicknames = (
        dict(db.execute(select(User.id, User.nickname).where(User.id.in_(user_ids))).all())
        if user_ids
        else {}
    )
    return [
        team_invitation_data(db, inv, user_id, nicknames, current_time=current_time)
        for inv in rows
    ]


def leave_team(db: Session, user_id: str, team_id: str) -> None:
    team = db.get(Team, team_id, with_for_update=True)
    if not team or team.status != "active":
        raise missing()
    member = db.get(TeamMember, (team.id, user_id))
    if member is None:
        raise missing()
    if member.role == "captain":
        raise ServiceError(
            409,
            "captain_cannot_leave",
            "队长暂不支持直接退出队伍，如需结束队伍请使用解散队伍",
        )
    db.delete(member)
    db.commit()


def remove_team_member(
    db: Session, user_id: str, team_id: str, member_user_id: str
) -> dict[str, Any]:
    team = _require_active_captain_team(db, user_id, team_id)
    target = db.get(TeamMember, (team.id, member_user_id))
    if target is None:
        raise missing()
    if target.role == "captain":
        raise ServiceError(409, "captain_cannot_remove_self", "不能移除队长本人")
    db.delete(target)
    db.commit()
    return team_summary_data(db, team, user_id, my_role="captain")


def disband_team(db: Session, user_id: str, team_id: str) -> dict[str, Any]:
    team = _require_active_captain_team(db, user_id, team_id)
    team.status = "disbanded"
    linked = db.scalar(select(Recruitment).where(Recruitment.team_id == team.id))
    if linked is not None:
        linked.is_published = False
    db.execute(
        update(TeamInvitation)
        .where(
            TeamInvitation.team_id == team.id,
            TeamInvitation.active_invite_key.is_not(None),
        )
        .values(active_invite_key=None)
        .execution_options(synchronize_session=False)
    )
    db.commit()
    return team_summary_data(db, team, user_id, my_role="captain")


def respond_team_invitation(
    db: Session,
    user_id: str,
    invitation_id: str,
    decision: str,
    response_message: str | None = None,
) -> dict[str, Any]:
    if decision not in ("accepted", "declined"):
        raise invalid("回应无效")
    cleaned_response = optional_text(response_message, 300)
    current_time = now()
    invitation = db.get(TeamInvitation, invitation_id)
    if not invitation or user_id not in (invitation.inviter_id, invitation.invitee_id):
        raise missing()
    if invitation.invitee_id != user_id:
        raise ServiceError(403, "forbidden", "只有被邀请者可以处理该正式组队邀请")
    if invitation.status == "pending" and current_time >= invitation.expires_at:
        raise ServiceError(409, "expired", "该正式组队邀请已超过 7 天有效期，无法继续处理")

    team = db.get(Team, invitation.team_id, with_for_update=True)
    if invitation.status == "pending" and (not team or team.status != "active"):
        raise ServiceError(409, "conflict", "该队伍已解散，无法继续处理正式组队邀请")

    if decision == "accepted":
        if not team or team.status != "active":
            raise ServiceError(409, "conflict", "该队伍当前无法接收新成员")
        result = db.execute(
            update(TeamInvitation)
            .where(
                TeamInvitation.id == invitation_id,
                TeamInvitation.status == "pending",
                TeamInvitation.expires_at > current_time,
            )
            .values(
                status="accepted",
                responded_at=current_time,
                response_message=cleaned_response,
                active_invite_key=None,
            )
            .execution_options(synchronize_session=False)
        )
        if result.rowcount == 1 and db.get(TeamMember, (team.id, user_id)) is None:
            db.add(
                TeamMember(
                    team_id=team.id,
                    user_id=user_id,
                    role="member",
                    joined_at=current_time,
                )
            )
        db.commit()
        db.expire_all()
        invitation = db.get(TeamInvitation, invitation_id)
        if result.rowcount == 0:
            if invitation.status == "pending":
                raise ServiceError(409, "expired", "该正式组队邀请已超过 7 天有效期，无法继续接受")
            if invitation.status != "accepted":
                raise ServiceError(409, "conflict", "该正式组队邀请已有不同回应")
        return team_invitation_data(db, invitation, user_id, current_time=current_time)

    result = db.execute(
        update(TeamInvitation)
        .where(
            TeamInvitation.id == invitation_id,
            TeamInvitation.status == "pending",
            TeamInvitation.expires_at > current_time,
        )
        .values(
            status="declined",
            responded_at=current_time,
            response_message=cleaned_response,
            expires_at=current_time + TEAM_INVITATION_TTL,
        )
        .execution_options(synchronize_session=False)
    )
    db.commit()
    db.expire_all()
    invitation = db.get(TeamInvitation, invitation_id)
    if result.rowcount == 0:
        if invitation.status == "pending":
            raise ServiceError(409, "expired", "该正式组队邀请已超过 7 天有效期，无法继续处理")
        if invitation.status != "declined":
            raise ServiceError(409, "conflict", "该正式组队邀请已有不同回应")
    return team_invitation_data(db, invitation, user_id, current_time=current_time)


def search_public_users(
    db: Session,
    user_id: str,
    query_text: str | None,
    team_id: str | None = None,
) -> list[dict[str, Any]]:
    keyword = (query_text or "").strip()
    if not keyword:
        return []
    excluded_ids: set[str] = {user_id}
    if team_id is not None:
        team = db.get(Team, team_id)
        if not team or team.status != "active":
            raise missing()
        if team.captain_id != user_id:
            raise ServiceError(403, "forbidden", "只有队长可以为该队伍搜索邀请对象")
        excluded_ids |= set(
            db.scalars(select(TeamMember.user_id).where(TeamMember.team_id == team.id))
        )
    query = (
        select(Profile)
        .join(Profile.user)
        .options(contains_eager(Profile.user))
        .where(
            Profile.user_id.notin_(excluded_ids),
            User.nickname.ilike(f"%{keyword}%"),
        )
        .order_by(User.nickname.asc())
        .limit(20)
    )
    if get_settings().auth_mode == "student":
        query = query.where(active_account(Profile.user_id))
    profiles = db.scalars(query).all()
    return [
        {
            "userId": p.user_id,
            "nickname": p.user.nickname,
            "skills": sorted(skill.code for skill in p.skills),
            "customSkills": p.custom_skills or [],
        }
        for p in profiles
    ]

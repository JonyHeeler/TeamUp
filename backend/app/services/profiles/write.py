from re import fullmatch
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.models import Contact, Profile, ProfileEvidence, User
from app.services.common import (
    ServiceError,
    get_skills,
    invalid_field,
    missing,
    optional_text,
    text,
)
from app.services.profiles.evidence import InvalidEvidence, prepare_image
from app.services.profiles.read import PROFILE_FIELDS, evidence_ids, profile_data


def replace_evidence(
    db: Session, user_id: str, entries: list[tuple[str, bytes | None]]
) -> list[str]:
    """Replace profile evidence within the current transaction."""
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
    """Validate and save the owner profile and contact."""
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
    profile.show_qq = public.get("qq", True)
    profile.introduction = introduction
    profile.skills = skills
    profile.custom_skills = custom_skills
    profile.projects = data["projects"]
    values = {**required, **optional}
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


def set_visibility(db: Session, user_id: str, listed: bool) -> dict[str, Any]:
    """Change discovery visibility without overwriting profile edits."""
    profile = db.get(Profile, user_id)
    if not profile:
        raise missing()
    profile.listed = listed
    db.commit()
    return {"listed": listed}

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Contact, Profile, ProfileEvidence
from app.services.common import active_account, missing, visible_member
from app.services.skill_search import matches_skill

PROFILE_FIELDS = {
    "college": "college",
    "major": "major",
    "grade": "grade",
    "experience": "experience",
    "competitionIntent": "competition_intent",
}


def profile_data(profile: Profile, private: bool = False) -> dict[str, Any]:
    """Project a profile according to its visibility settings."""
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
    if private or (profile.show_experience and profile.projects):
        result["projects"] = profile.projects or []
    if private:
        result["listed"] = profile.listed
        result["publicFields"] = {
            "qq": profile.show_qq,
            **{
                field: getattr(profile, "show_" + attribute)
                for field, attribute in PROFILE_FIELDS.items()
            },
        }
    return result


def list_profiles(db: Session, skill: str | None = None) -> list[dict[str, Any]]:
    """List public profiles filtered by skill."""
    query = select(Profile).where(Profile.listed.is_(True))
    if get_settings().auth_mode == "student":
        query = query.where(active_account(Profile.user_id))
    profiles = list(db.scalars(query.order_by(Profile.user_id)))
    if skill and skill.strip():
        profiles = [
            p
            for p in profiles
            if matches_skill(
                skill,
                (tag.code for tag in p.skills),
                descriptions=(p.introduction,),
            )
        ]
    return [public_data(db, p) for p in profiles]


def evidence_ids(db: Session, user_id: str) -> list[str]:
    """List profile evidence identifiers in display order."""
    return list(
        db.scalars(
            select(ProfileEvidence.id)
            .where(ProfileEvidence.user_id == user_id)
            .order_by(ProfileEvidence.position)
        )
    )


def get_evidence(db: Session, user_id: str, image_id: str, viewer_id: str | None) -> bytes:
    """Read an evidence image when the viewer is allowed."""
    query = (
        select(ProfileEvidence.image)
        .join(Profile, Profile.user_id == ProfileEvidence.user_id)
        .where(ProfileEvidence.user_id == user_id, ProfileEvidence.id == image_id)
    )
    if viewer_id != user_id:
        query = query.where(Profile.show_experience.is_(True), Profile.listed.is_(True))
    if get_settings().auth_mode == "student":
        query = query.where(active_account(ProfileEvidence.user_id))
    image = db.scalar(query)
    if image is None:
        raise missing()
    return image


def get_profile(db: Session, user_id: str, private: bool = False) -> dict[str, Any]:
    """Read the public or owner view of a profile."""
    profile = db.get(Profile, user_id)
    if not profile or (not private and (not profile.listed or not visible_member(db, user_id))):
        raise missing()
    result = profile_data(profile, private) if private else public_data(db, profile)
    if private:
        contact = db.get(Contact, user_id)
        result["qq"] = contact.qq if contact else None
    if private or profile.show_experience:
        ids = evidence_ids(db, user_id)
        if private or ids:
            result["evidenceIds"] = ids
    return result


def public_data(db: Session, profile: Profile) -> dict[str, Any]:
    """Include a contact only when its owner chose to publish it."""
    result = profile_data(profile)
    if profile.show_qq:
        contact = db.get(Contact, profile.user_id)
        if contact:
            result["qq"] = contact.qq
    return result

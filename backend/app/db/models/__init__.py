"""Register all mapped models and expose their shared metadata to Alembic."""

from app.db.models.accounts import (
    AccountAuditEvent,
    AccountChallenge,
    AccountRateLimit,
    AccountSession,
    StudentAccount,
)
from app.db.models.base import Base
from app.db.models.intents import Intent
from app.db.models.profiles import Profile, ProfileEvidence, ProfileSkill, Skill
from app.db.models.recruitments import Recruitment, RecruitmentSkill, TeamNumberCounter
from app.db.models.users import Contact, User

__all__ = [
    "AccountAuditEvent",
    "AccountChallenge",
    "AccountRateLimit",
    "AccountSession",
    "Base",
    "Contact",
    "Intent",
    "Profile",
    "ProfileEvidence",
    "ProfileSkill",
    "Recruitment",
    "RecruitmentSkill",
    "Skill",
    "StudentAccount",
    "TeamNumberCounter",
    "User",
]

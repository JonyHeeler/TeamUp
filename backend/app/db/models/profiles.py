from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
)
from sqlalchemy.dialects.mysql import MEDIUMBLOB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import Base, table_options, uuid_type
from app.db.models.users import User


class Skill(Base):
    """Store one supported preset skill label."""

    __tablename__ = "skills"
    __table_args__ = table_options
    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(80))


class Profile(Base):
    """Store a discoverable profile and the owner's visibility choices."""

    __tablename__ = "profiles"
    __table_args__ = table_options
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"), primary_key=True)
    introduction: Mapped[str] = mapped_column("contribution", String(500))
    college: Mapped[str | None] = mapped_column(String(80))
    major: Mapped[str | None] = mapped_column(String(80))
    grade: Mapped[str | None] = mapped_column(String(80))
    projects: Mapped[list[dict[str, str]] | None] = mapped_column(JSON)
    experience: Mapped[str | None] = mapped_column(String(500))
    competition_intent: Mapped[str | None] = mapped_column(String(500))
    custom_skills: Mapped[list[str] | None] = mapped_column(JSON)
    listed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    show_qq: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    show_college: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    show_major: Mapped[bool] = mapped_column(Boolean, default=False)
    show_grade: Mapped[bool] = mapped_column(Boolean, default=False)
    show_experience: Mapped[bool] = mapped_column(Boolean, default=False)
    show_competition_intent: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship()
    skills: Mapped[list[Skill]] = relationship(secondary="profile_skills")


class ProfileSkill(Base):
    """Associate one preset skill with a profile."""

    __tablename__ = "profile_skills"
    __table_args__ = (Index("ix_profile_skills_skill_user", "skill_code", "user_id"), table_options)
    user_id: Mapped[str] = mapped_column(
        uuid_type, ForeignKey("profiles.user_id"), primary_key=True
    )
    skill_code: Mapped[str] = mapped_column(String(32), ForeignKey("skills.code"), primary_key=True)


class ProfileEvidence(Base):
    """Store one ordered WebP image attached to a profile."""

    __tablename__ = "profile_evidence"
    __table_args__ = (
        Index("ix_profile_evidence_user_position", "user_id", "position"),
        CheckConstraint(
            "OCTET_LENGTH(image) BETWEEN 1 AND 1000000", name="ck_profile_evidence_size"
        ),
        table_options,
    )
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("profiles.user_id"))
    position: Mapped[int] = mapped_column(Integer)
    image: Mapped[bytes] = mapped_column(LargeBinary().with_variant(MEDIUMBLOB(), "mysql"))

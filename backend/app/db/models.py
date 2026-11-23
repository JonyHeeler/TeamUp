from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import CHAR, DATETIME
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


uuid_type = String(36).with_variant(CHAR(36, charset="ascii", collation="ascii_bin"), "mysql")
utc_type = DateTime().with_variant(DATETIME(fsp=6), "mysql")
table_options = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


class User(Base):
    __tablename__ = "users"
    __table_args__ = table_options
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    nickname: Mapped[str] = mapped_column(String(80))


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = table_options
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"), primary_key=True)
    qq: Mapped[str] = mapped_column(String(64))


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = table_options
    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(80))


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = table_options
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"), primary_key=True)
    contribution: Mapped[str] = mapped_column(String(500))
    major: Mapped[str | None] = mapped_column(String(80))
    grade: Mapped[str | None] = mapped_column(String(80))
    experience: Mapped[str | None] = mapped_column(String(500))
    show_major: Mapped[bool] = mapped_column(Boolean, default=False)
    show_grade: Mapped[bool] = mapped_column(Boolean, default=False)
    show_experience: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship()
    skills: Mapped[list[Skill]] = relationship(secondary="profile_skills")


class ProfileSkill(Base):
    __tablename__ = "profile_skills"
    __table_args__ = (Index("ix_profile_skills_skill_user", "skill_code", "user_id"), table_options)
    user_id: Mapped[str] = mapped_column(
        uuid_type, ForeignKey("profiles.user_id"), primary_key=True
    )
    skill_code: Mapped[str] = mapped_column(String(32), ForeignKey("skills.code"), primary_key=True)


class Recruitment(Base):
    __tablename__ = "recruitments"
    __table_args__ = (
        CheckConstraint("openings > 0", name="ck_recruitment_openings"),
        Index("ix_recruitment_owner_created", "owner_id", "created_at"),
        table_options,
    )
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    owner_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"))
    competition: Mapped[str] = mapped_column(String(80))
    team_name: Mapped[str] = mapped_column(String(80))
    openings: Mapped[int] = mapped_column(Integer)
    task: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(utc_type)
    skills: Mapped[list[Skill]] = relationship(secondary="recruitment_skills")


class RecruitmentSkill(Base):
    __tablename__ = "recruitment_skills"
    __table_args__ = (
        Index("ix_recruitment_skills_skill_recruitment", "skill_code", "recruitment_id"),
        table_options,
    )
    recruitment_id: Mapped[str] = mapped_column(
        uuid_type, ForeignKey("recruitments.id"), primary_key=True
    )
    skill_code: Mapped[str] = mapped_column(String(32), ForeignKey("skills.code"), primary_key=True)


class Intent(Base):
    __tablename__ = "intents"
    __table_args__ = (
        UniqueConstraint("recruitment_id", "candidate_id", name="uq_intent_recruitment_candidate"),
        CheckConstraint(
            "(status = 'pending' AND responded_at IS NULL) OR (status <> 'pending' AND responded_at IS NOT NULL)",
            name="ck_intent_response_time",
        ),
        Index("ix_intent_candidate_created", "candidate_id", "created_at"),
        table_options,
    )
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    recruitment_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("recruitments.id"))
    candidate_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("profiles.user_id"))
    kind: Mapped[str] = mapped_column(Enum("apply", "invite", name="intent_kind"))
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "declined", name="intent_status")
    )
    created_at: Mapped[datetime] = mapped_column(utc_type)
    responded_at: Mapped[datetime | None] = mapped_column(utc_type)
    recruitment: Mapped[Recruitment] = relationship()

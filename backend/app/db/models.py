from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import CHAR, DATETIME, MEDIUMBLOB, VARCHAR
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


ascii_id_type = String(64).with_variant(CHAR(64, charset="ascii", collation="ascii_bin"), "mysql")
student_id_type = String(64).with_variant(
    VARCHAR(64, charset="ascii", collation="ascii_bin"), "mysql"
)


class StudentAccount(Base):
    __tablename__ = "student_accounts"
    __table_args__ = table_options
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"), primary_key=True)
    student_id: Mapped[str] = mapped_column(student_id_type, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(Enum("active", "suspended", name="account_status"))
    verified_at: Mapped[datetime] = mapped_column(utc_type)


class AccountChallenge(Base):
    __tablename__ = "account_challenges"
    __table_args__ = (Index("ix_account_challenge_student_purpose", "student_id", "purpose"), table_options)
    token_hash: Mapped[str] = mapped_column(ascii_id_type, primary_key=True)
    student_id: Mapped[str] = mapped_column(student_id_type)
    purpose: Mapped[str] = mapped_column(Enum("activate", "reset", name="account_challenge_purpose"))
    expires_at: Mapped[datetime] = mapped_column(utc_type)
    consumed_at: Mapped[datetime | None] = mapped_column(utc_type)


class AccountSession(Base):
    __tablename__ = "account_sessions"
    __table_args__ = (Index("ix_account_session_user", "user_id"), table_options)
    token_hash: Mapped[str] = mapped_column(ascii_id_type, primary_key=True)
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(utc_type)
    idle_expires_at: Mapped[datetime] = mapped_column(utc_type)
    expires_at: Mapped[datetime] = mapped_column(utc_type)
    revoked_at: Mapped[datetime | None] = mapped_column(utc_type)


class AccountAuditEvent(Base):
    __tablename__ = "account_audit_events"
    __table_args__ = table_options
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    user_id: Mapped[str | None] = mapped_column(uuid_type, ForeignKey("users.id"))
    event: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(utc_type)


class AccountRateLimit(Base):
    __tablename__ = "account_rate_limits"
    __table_args__ = table_options
    key_hash: Mapped[str] = mapped_column(ascii_id_type, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(utc_type)
    attempts: Mapped[int] = mapped_column(Integer)


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
    introduction: Mapped[str] = mapped_column("contribution", String(500))
    college: Mapped[str | None] = mapped_column(String(80))
    major: Mapped[str | None] = mapped_column(String(80))
    grade: Mapped[str | None] = mapped_column(String(80))
    projects: Mapped[list[dict[str, str]] | None] = mapped_column(JSON)
    experience: Mapped[str | None] = mapped_column(String(500))
    competition_intent: Mapped[str | None] = mapped_column(String(500))
    custom_skills: Mapped[list[str] | None] = mapped_column(JSON)
    show_college: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    show_major: Mapped[bool] = mapped_column(Boolean, default=False)
    show_grade: Mapped[bool] = mapped_column(Boolean, default=False)
    show_experience: Mapped[bool] = mapped_column(Boolean, default=False)
    show_competition_intent: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship()
    skills: Mapped[list[Skill]] = relationship(secondary="profile_skills")


class ProfileSkill(Base):
    __tablename__ = "profile_skills"
    __table_args__ = (Index("ix_profile_skills_skill_user", "skill_code", "user_id"), table_options)
    user_id: Mapped[str] = mapped_column(
        uuid_type, ForeignKey("profiles.user_id"), primary_key=True
    )
    skill_code: Mapped[str] = mapped_column(String(32), ForeignKey("skills.code"), primary_key=True)


class ProfileEvidence(Base):
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


class Recruitment(Base):
    __tablename__ = "recruitments"
    __table_args__ = (
        CheckConstraint("openings > 0", name="ck_recruitment_openings"),
        CheckConstraint(
            "requirements IS NULL OR (JSON_TYPE(requirements) = 'ARRAY' AND JSON_LENGTH(requirements) = openings)",
            name="ck_recruitment_requirement_count",
        ),
        UniqueConstraint("team_number", name="uq_recruitment_team_number"),
        Index("ix_recruitment_owner_created", "owner_id", "created_at"),
        table_options,
    )
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    owner_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"))
    competition: Mapped[str] = mapped_column(String(80))
    team_name: Mapped[str] = mapped_column(String(80))
    is_published: Mapped[bool] = mapped_column(Boolean, server_default="1")
    team_number: Mapped[str] = mapped_column(CHAR(11, charset="ascii", collation="ascii_bin"))
    openings: Mapped[int] = mapped_column(Integer)
    background: Mapped[str] = mapped_column("task", String(1200))
    requirements: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON(none_as_null=True))
    created_at: Mapped[datetime] = mapped_column(utc_type)
    skills: Mapped[list[Skill]] = relationship(secondary="recruitment_skills")


class TeamNumberCounter(Base):
    __tablename__ = "team_number_counters"
    __table_args__ = table_options
    day: Mapped[str] = mapped_column(
        CHAR(8, charset="ascii", collation="ascii_bin"), primary_key=True
    )
    last_index: Mapped[int] = mapped_column(Integer)


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
    message: Mapped[str | None] = mapped_column(String(300))
    recruitment: Mapped[Recruitment] = relationship()

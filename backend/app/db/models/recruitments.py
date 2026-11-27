from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import Base, table_options, utc_type, uuid_type
from app.db.models.profiles import Skill
from app.db.models.users import User


class Recruitment(Base):
    """Store one team's recruitment, expectations and visibility."""

    __tablename__ = "recruitments"
    __table_args__ = (
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
    openings: Mapped[str | None] = mapped_column(String(40))
    background: Mapped[str] = mapped_column("task", String(1200))
    requirements: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON(none_as_null=True))
    created_at: Mapped[datetime] = mapped_column(utc_type)
    skills: Mapped[list[Skill]] = relationship(secondary="recruitment_skills")
    owner: Mapped["User"] = relationship()


class TeamNumberCounter(Base):
    """Track the last number issued on a Beijing calendar day."""

    __tablename__ = "team_number_counters"
    __table_args__ = table_options
    day: Mapped[str] = mapped_column(
        CHAR(8, charset="ascii", collation="ascii_bin"), primary_key=True
    )
    last_index: Mapped[int] = mapped_column(Integer)


class RecruitmentSkill(Base):
    """Associate one preset skill with a recruitment."""

    __tablename__ = "recruitment_skills"
    __table_args__ = (
        Index("ix_recruitment_skills_skill_recruitment", "skill_code", "recruitment_id"),
        table_options,
    )
    recruitment_id: Mapped[str] = mapped_column(
        uuid_type, ForeignKey("recruitments.id"), primary_key=True
    )
    skill_code: Mapped[str] = mapped_column(String(32), ForeignKey("skills.code"), primary_key=True)

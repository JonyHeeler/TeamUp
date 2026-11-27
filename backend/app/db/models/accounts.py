from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.mysql import CHAR, VARCHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.base import Base, table_options, utc_type, uuid_type

ascii_id_type = String(64).with_variant(CHAR(64, charset="ascii", collation="ascii_bin"), "mysql")
student_id_type = String(64).with_variant(
    VARCHAR(64, charset="ascii", collation="ascii_bin"), "mysql"
)


class StudentAccount(Base):
    """Store verified student credentials and account status."""

    __tablename__ = "student_accounts"
    __table_args__ = table_options
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"), primary_key=True)
    student_id: Mapped[str] = mapped_column(student_id_type, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(Enum("active", "suspended", name="account_status"))
    verified_at: Mapped[datetime] = mapped_column(utc_type)


class AccountChallenge(Base):
    """Store a time-limited activation or recovery challenge."""

    __tablename__ = "account_challenges"
    __table_args__ = (
        Index("ix_account_challenge_student_purpose", "student_id", "purpose"),
        table_options,
    )
    token_hash: Mapped[str] = mapped_column(ascii_id_type, primary_key=True)
    student_id: Mapped[str] = mapped_column(student_id_type)
    purpose: Mapped[str] = mapped_column(
        Enum("activate", "reset", name="account_challenge_purpose")
    )
    expires_at: Mapped[datetime] = mapped_column(utc_type)
    consumed_at: Mapped[datetime | None] = mapped_column(utc_type)


class AccountSession(Base):
    """Track the lifetime and revocation of a student session."""

    __tablename__ = "account_sessions"
    __table_args__ = (Index("ix_account_session_user", "user_id"), table_options)
    token_hash: Mapped[str] = mapped_column(ascii_id_type, primary_key=True)
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(utc_type)
    idle_expires_at: Mapped[datetime] = mapped_column(utc_type)
    expires_at: Mapped[datetime] = mapped_column(utc_type)
    revoked_at: Mapped[datetime | None] = mapped_column(utc_type)


class AccountAuditEvent(Base):
    """Record an account event without storing credential values."""

    __tablename__ = "account_audit_events"
    __table_args__ = table_options
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    user_id: Mapped[str | None] = mapped_column(uuid_type, ForeignKey("users.id"))
    event: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(utc_type)


class AccountRateLimit(Base):
    """Count attempts within the current authentication rate limit."""

    __tablename__ = "account_rate_limits"
    __table_args__ = table_options
    key_hash: Mapped[str] = mapped_column(ascii_id_type, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(utc_type)
    attempts: Mapped[int] = mapped_column(Integer)

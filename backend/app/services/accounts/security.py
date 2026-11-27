import hashlib
import hmac
import re
import secrets
from datetime import UTC, timedelta
from functools import lru_cache
from os import getenv
from pathlib import Path
from uuid import uuid4

from argon2 import PasswordHasher
from sqlalchemy import select, update
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import AccountAuditEvent, AccountChallenge, AccountRateLimit, StudentAccount
from app.services.common import ServiceError, now

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash("TeamUP dummy password 2026!")


@lru_cache(maxsize=1)
def password_blocklist() -> frozenset[str]:
    """Load the configured list of prohibited passwords."""
    entries = {
        "correcthorsebatterystaple",
        "passwordpassword",
        "123456789012345",
        "qwertyuiopasdfghjkl",
    }
    path = getenv("TEAMUP_PASSWORD_BLOCKLIST")
    if path:
        with Path(path).open(encoding="utf-8") as file:
            entries.update(line.rstrip("\r\n").casefold() for line in file)
    return frozenset(entries)


def digest(value: str) -> str:
    """Hash a sensitive token for storage."""
    return hashlib.sha256(value.encode()).hexdigest()


def validate_student_id(value: str) -> str:
    """Validate and normalize a student identifier."""
    if not re.fullmatch(r"[A-Za-z0-9]{4,32}", value):
        raise ServiceError(422, "validation_error", "学号格式无效")
    return value


def validate_password(value: str, student_id: str) -> None:
    """Enforce the account password requirements."""
    if len(value) < 15 or len(value) > 128 or len(value.encode("utf-8")) > 512:
        raise ServiceError(422, "validation_error", "密码须为 15 至 128 个字符")
    if value.casefold() in password_blocklist() or value.casefold() == student_id.casefold():
        raise ServiceError(
            422, "weak_password", "请换一个较少使用的密码", {"password": "请换一个较少使用的密码"}
        )


def audit(db: Session, event: str, user_id: str | None = None) -> None:
    """Record an account security event in the current transaction."""
    db.add(AccountAuditEvent(id=str(uuid4()), user_id=user_id, event=event, created_at=now()))


def limit(db: Session, student_id: str, source: str, action: str) -> None:
    # Fixed windows are stored in the database and updated atomically across workers.
    """Apply account action rate limits for the user and source."""
    timestamp = now()
    window = int(timestamp.replace(tzinfo=UTC).timestamp()) // 900
    for name, value, cap in [("id", student_id, 10), ("source", source, 50)]:
        key = hmac.new(
            get_settings().session_secret.encode(),
            f"{action}:{name}:{value}:{window}".encode(),
            hashlib.sha256,
        ).hexdigest()
        statement = insert(AccountRateLimit).values(
            key_hash=key, expires_at=timestamp + timedelta(minutes=16), attempts=1
        )
        db.execute(statement.on_duplicate_key_update(attempts=AccountRateLimit.attempts + 1))
        attempts = db.scalar(
            select(AccountRateLimit.attempts).where(AccountRateLimit.key_hash == key)
        )
        if attempts > cap:
            db.commit()
            raise ServiceError(429, "rate_limited", "操作过于频繁，请稍后重试")
    db.commit()


def issue_ticket(db: Session, student_id: str, purpose: str, expires_in_seconds: int = 3600) -> str:
    """Issue an activation or password reset ticket."""
    validate_student_id(student_id)
    if purpose not in {"activate", "reset"} or not 60 <= expires_in_seconds <= 86400:
        raise ValueError("Invalid ticket purpose or lifetime")
    account = db.scalar(
        select(StudentAccount).where(StudentAccount.student_id == student_id).with_for_update()
    )
    if (purpose == "activate" and account is not None) or (
        purpose == "reset" and (account is None or account.status != "active")
    ):
        raise ServiceError(409, "invalid_account", "账户状态不允许签发该凭证")
    db.execute(
        update(AccountChallenge)
        .where(
            AccountChallenge.student_id == student_id,
            AccountChallenge.purpose == purpose,
            AccountChallenge.consumed_at.is_(None),
        )
        .values(consumed_at=now())
    )
    token = secrets.token_urlsafe(32)
    db.add(
        AccountChallenge(
            token_hash=digest(token),
            student_id=student_id,
            purpose=purpose,
            expires_at=now() + timedelta(seconds=expires_in_seconds),
            consumed_at=None,
        )
    )
    audit(db, "ticket_issued")
    db.commit()
    return token


def consume_ticket(db: Session, student_id: str, token: str, purpose: str) -> None:
    """Verify and consume a single-use account ticket."""
    challenge = db.scalar(
        select(AccountChallenge)
        .where(AccountChallenge.token_hash == digest(token))
        .with_for_update()
    )
    if (
        challenge is None
        or challenge.student_id != student_id
        or challenge.purpose != purpose
        or challenge.consumed_at is not None
        or challenge.expires_at <= now()
    ):
        raise ServiceError(400, "invalid_ticket", "凭证无效或已过期")
    challenge.consumed_at = now()

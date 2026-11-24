import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from os import getenv
from pathlib import Path
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import select, update
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import (
    AccountAuditEvent,
    AccountChallenge,
    AccountRateLimit,
    AccountSession,
    Recruitment,
    StudentAccount,
    User,
)
from app.services.teamup import ServiceError

hasher = PasswordHasher()
SESSION_IDLE = timedelta(minutes=30)
SESSION_ABSOLUTE = timedelta(hours=12)
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)
DUMMY_HASH = hasher.hash("TeamUP dummy password 2026!")


@lru_cache(maxsize=1)
def password_blocklist() -> frozenset[str]:
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


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def validate_student_id(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9]{4,32}", value):
        raise ServiceError(422, "validation_error", "学号格式无效")
    return value


def validate_password(value: str, student_id: str) -> None:
    if len(value) < 15 or len(value) > 128 or len(value.encode("utf-8")) > 512:
        raise ServiceError(422, "validation_error", "密码须为 15 至 128 个字符")
    if value.casefold() in password_blocklist() or value.casefold() == student_id.casefold():
        raise ServiceError(
            422, "weak_password", "请换一个较少使用的密码", {"password": "请换一个较少使用的密码"}
        )


def audit(db: Session, event: str, user_id: str | None = None) -> None:
    db.add(AccountAuditEvent(id=str(uuid4()), user_id=user_id, event=event, created_at=now()))


def limit(db: Session, student_id: str, source: str, action: str) -> None:
    # Fixed windows are stored in the database and updated atomically across workers.
    timestamp = now()
    window = int(timestamp.timestamp()) // 900
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


def set_account_status(db: Session, student_id: str, status: str) -> None:
    if status not in {"active", "suspended"}:
        raise ServiceError(422, "invalid_status", "账户状态无效")
    account = db.scalar(
        select(StudentAccount).where(StudentAccount.student_id == student_id).with_for_update()
    )
    if account is None:
        raise ServiceError(404, "not_found", "账户不存在")
    account.status = status
    if status == "suspended":
        db.execute(
            update(Recruitment)
            .where(Recruitment.owner_id == account.user_id, Recruitment.is_published.is_(True))
            .values(is_published=False)
        )
        db.execute(
            update(AccountSession)
            .where(AccountSession.user_id == account.user_id, AccountSession.revoked_at.is_(None))
            .values(revoked_at=now())
        )
    audit(db, "status_" + status, account.user_id)
    db.commit()


def consume_ticket(db: Session, student_id: str, token: str, purpose: str) -> None:
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


def create_session(db: Session, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    timestamp = now()
    db.add(
        AccountSession(
            token_hash=digest(token),
            user_id=user_id,
            created_at=timestamp,
            idle_expires_at=timestamp + SESSION_IDLE,
            expires_at=timestamp + SESSION_ABSOLUTE,
            revoked_at=None,
        )
    )
    return token


def register(db: Session, student_id: str, password: str, ticket: str, source: str):
    validate_student_id(student_id)
    validate_password(password, student_id)
    limit(db, student_id, source, "register")
    consume_ticket(db, student_id, ticket, "activate")
    if db.scalar(select(StudentAccount).where(StudentAccount.student_id == student_id)):
        raise ServiceError(409, "account_exists", "账户已存在")
    user_id = str(uuid4())
    db.add(User(id=user_id, nickname="未设置昵称"))
    db.flush()
    db.add(
        StudentAccount(
            user_id=user_id,
            student_id=student_id,
            password_hash=hasher.hash(password),
            status="active",
            verified_at=now(),
        )
    )
    token = create_session(db, user_id)
    audit(db, "registered", user_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ServiceError(409, "account_exists", "账户已存在") from None
    return user_id, token


def login(db: Session, student_id: str, password: str, source: str):
    validate_student_id(student_id)
    limit(db, student_id, source, "login")
    account = db.scalar(
        select(StudentAccount).where(StudentAccount.student_id == student_id).with_for_update()
    )
    try:
        valid = hasher.verify(account.password_hash if account else DUMMY_HASH, password)
    except (VerifyMismatchError, InvalidHashError):
        valid = False
    if not account or not valid or account.status != "active":
        audit(db, "login_failed")
        db.commit()
        raise ServiceError(401, "invalid_credentials", "学号或密码错误")
    if hasher.check_needs_rehash(account.password_hash):
        account.password_hash = hasher.hash(password)
    token = create_session(db, account.user_id)
    audit(db, "login", account.user_id)
    db.commit()
    return account.user_id, token


def session_user(db: Session, token: str | None) -> str | None:
    if not token or len(token) > 200:
        return None
    timestamp = now()
    session = db.get(AccountSession, digest(token))
    if (
        not session
        or session.revoked_at
        or session.expires_at <= timestamp
        or session.idle_expires_at <= timestamp
    ):
        return None
    account = db.get(StudentAccount, session.user_id)
    if not account or account.status != "active":
        return None
    if session.idle_expires_at <= timestamp + SESSION_IDLE - SESSION_TOUCH_INTERVAL:
        session.idle_expires_at = min(timestamp + SESSION_IDLE, session.expires_at)
        db.commit()
    return session.user_id


def csrf(token: str) -> str:
    secret = get_settings().session_secret
    if len(secret.encode()) < 32:
        raise RuntimeError("TEAMUP_SESSION_SECRET must be at least 32 bytes")
    return hmac.new(secret.encode(), ("csrf:" + token).encode(), hashlib.sha256).hexdigest()


def revoke(db: Session, token: str) -> None:
    session = db.get(AccountSession, digest(token))
    if session and not session.revoked_at:
        session.revoked_at = now()
        audit(db, "logout", session.user_id)
        db.commit()


def reset_password(db: Session, student_id: str, ticket: str, password: str, source: str) -> None:
    validate_student_id(student_id)
    validate_password(password, student_id)
    limit(db, student_id, source, "reset")
    account = db.scalar(
        select(StudentAccount).where(StudentAccount.student_id == student_id).with_for_update()
    )
    if not account or account.status != "active":
        raise ServiceError(400, "invalid_ticket", "凭证无效或已过期")
    consume_ticket(db, student_id, ticket, "reset")
    account.password_hash = hasher.hash(password)
    db.execute(
        update(AccountSession)
        .where(AccountSession.user_id == account.user_id, AccountSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )
    audit(db, "password_reset", account.user_id)
    db.commit()


def change_password(db: Session, user_id: str, current: str, password: str, source: str) -> None:
    limit(db, user_id, source, "change")
    account = db.get(StudentAccount, user_id, with_for_update=True)
    try:
        valid = account and hasher.verify(account.password_hash, current)
    except (VerifyMismatchError, InvalidHashError):
        valid = False
    if not valid:
        raise ServiceError(401, "invalid_credentials", "当前密码错误")
    validate_password(password, account.student_id)
    account.password_hash = hasher.hash(password)
    db.execute(
        update(AccountSession)
        .where(AccountSession.user_id == user_id, AccountSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )
    audit(db, "password_changed", user_id)
    db.commit()

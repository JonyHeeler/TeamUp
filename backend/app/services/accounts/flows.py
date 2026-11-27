from uuid import uuid4

from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Recruitment, StudentAccount, User
from app.services.accounts.security import (
    DUMMY_HASH,
    audit,
    consume_ticket,
    hasher,
    limit,
    validate_password,
    validate_student_id,
)
from app.services.accounts.sessions import create_session, revoke_user_sessions
from app.services.common import ServiceError, now


def set_account_status(db: Session, student_id: str, status: str) -> None:
    """Change an account status and revoke access when needed."""
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
        revoke_user_sessions(db, account.user_id)
    audit(db, "status_" + status, account.user_id)
    db.commit()


def register(db: Session, student_id: str, password: str, ticket: str, source: str):
    """Register a student account using an activation ticket."""
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
    """Authenticate a student and create a session."""
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


def reset_password(db: Session, student_id: str, ticket: str, password: str, source: str) -> None:
    """Reset a password using a single-use reset ticket."""
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
    revoke_user_sessions(db, account.user_id)
    audit(db, "password_reset", account.user_id)
    db.commit()


def change_password(db: Session, user_id: str, current: str, password: str, source: str) -> None:
    """Change a password after verifying the current password."""
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
    revoke_user_sessions(db, user_id)
    audit(db, "password_changed", user_id)
    db.commit()

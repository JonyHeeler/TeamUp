import hashlib
import hmac
import secrets
from datetime import timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import AccountSession, StudentAccount
from app.services.accounts.security import audit, digest
from app.services.common import now

SESSION_IDLE = timedelta(minutes=30)
SESSION_ABSOLUTE = timedelta(hours=12)
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)


def create_session(db: Session, user_id: str) -> str:
    """Create a student session and return its secret token."""
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


def session_user(db: Session, token: str | None) -> str | None:
    """Resolve a valid session token to its user."""
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
    """Derive a CSRF token from a session token."""
    secret = get_settings().session_secret
    if len(secret.encode()) < 32:
        raise RuntimeError("TEAMUP_SESSION_SECRET must be at least 32 bytes")
    return hmac.new(secret.encode(), ("csrf:" + token).encode(), hashlib.sha256).hexdigest()


def revoke(db: Session, token: str) -> None:
    """Revoke an account session."""
    session = db.get(AccountSession, digest(token))
    if session and not session.revoked_at:
        session.revoked_at = now()
        audit(db, "logout", session.user_id)
        db.commit()


def revoke_user_sessions(db: Session, user_id: str) -> None:
    """Revoke every active session for this user in the caller's transaction."""
    db.execute(
        update(AccountSession)
        .where(AccountSession.user_id == user_id, AccountSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )

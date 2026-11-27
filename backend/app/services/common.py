from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Skill, StudentAccount, User


class ServiceError(Exception):
    """Carry an HTTP status, service error code, and field errors."""

    def __init__(self, status: int, code: str, message: str, fields: dict | None = None):
        """Initialize the error details."""
        self.status, self.code, self.message, self.fields = status, code, message, fields
        super().__init__(message)


def missing() -> ServiceError:
    """Create a missing-record error."""
    return ServiceError(404, "not_found", "未找到记录")


def invalid(message: str) -> ServiceError:
    """Create an input validation error."""
    return ServiceError(422, "validation_error", message)


def invalid_field(field: str, message: str) -> ServiceError:
    """Create a field-specific validation error."""
    return ServiceError(422, "validation_error", message, {field: message})


def now() -> datetime:
    """Return the current UTC time for database storage."""
    return datetime.now(UTC).replace(tzinfo=None)


def timestamp(value: datetime) -> str:
    """Format a database UTC time for the API."""
    return value.isoformat(timespec="microseconds") + "Z"


def text(value: Any, maximum: int) -> str:
    """Validate and trim required text."""
    if not isinstance(value, str) or not (value := value.strip()) or len(value) > maximum:
        raise invalid("请填写有效的文本")
    return value


def optional_text(value: Any, maximum: int) -> str | None:
    """Validate and trim optional text."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return text(value, maximum)


def get_skills(db: Session, codes: Any) -> list[Skill]:
    """Resolve and validate skill codes."""
    if not isinstance(codes, list) or any(not isinstance(c, str) for c in codes):
        raise invalid("技能无效")
    if not codes:
        return []
    codes = list(dict.fromkeys(codes))
    skills = list(db.scalars(select(Skill).where(Skill.code.in_(codes))))
    if len(skills) != len(codes):
        raise invalid("技能无效")
    return skills


def get_user(db: Session, user_id: str) -> dict[str, Any]:
    """Read a user identity."""
    user = db.get(User, user_id)
    if not user:
        raise missing()
    return {"userId": user.id, "nickname": user.nickname}


def active_account(user_id):
    """Build a predicate for an active student account."""
    return (
        select(StudentAccount.user_id)
        .where(StudentAccount.user_id == user_id, StudentAccount.status == "active")
        .exists()
    )


def visible_member(db: Session, user_id: str) -> bool:
    """Check whether a user may appear in public queries."""
    return get_settings().auth_mode != "student" or bool(db.scalar(select(active_account(user_id))))

from fastapi import Depends, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from app.api.schemas.system import Error
from app.config import get_settings
from app.db.session import get_db
from app.demo import PERSONAS
from app.services import accounts
from app.services.common import ServiceError

DB_DEP = Depends(get_db)


# Declare the shared error response schema for the supplied status codes.
def errors(*codes: int) -> dict[int, dict[str, type[Error]]]:
    return {code: {"model": Error} for code in codes}


ACCOUNT_COOKIE = "__Host-teamup_account"


# Resolve the current student or demo identity, allowing anonymous requests.
def optional_user(request: Request, db: Session = DB_DEP) -> str | None:
    settings = get_settings()
    if settings.auth_mode == "student":
        if hasattr(request.state, "account_user"):
            return request.state.account_user
        return accounts.session_user(db, request.cookies.get(ACCOUNT_COOKIE))
    token = request.cookies.get("teamup_session")
    if settings.demo_mode and settings.session_secret and token:
        try:
            persona = URLSafeTimedSerializer(settings.session_secret, salt="teamup-session").loads(
                token, max_age=86400
            )
            if persona in PERSONAS:
                return PERSONAS[persona]
        except (BadSignature, SignatureExpired, TypeError):
            pass
    return None


# Require a valid session for routes that need an identified user.
def current_user(request: Request, db: Session = DB_DEP) -> str:
    user = optional_user(request, db)
    if user is not None:
        return user
    raise ServiceError(401, "unauthorized", "请先选择演示身份")

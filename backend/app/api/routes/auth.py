from fastapi import APIRouter, Depends, Request, Response
from itsdangerous import URLSafeTimedSerializer
from sqlalchemy.orm import Session

from app.api.dependencies import ACCOUNT_COOKIE, DB_DEP, current_user, errors
from app.api.schemas import auth as s
from app.config import get_settings
from app.demo import PERSONAS
from app.services import accounts
from app.services.common import ServiceError, get_user

router = APIRouter()


# Require student authentication and a usable signing secret.
def student_mode() -> None:
    if get_settings().auth_mode != "student":
        raise ServiceError(404, "not_found", "账户模式未启用")
    if len(get_settings().session_secret.encode()) < 32:
        raise RuntimeError("TEAMUP_SESSION_SECRET must be at least 32 bytes")


# Set the student cookie and CSRF header and return the current identity.
def student_result(db: Session, user_id: str, token: str, response: Response):
    response.set_cookie(
        ACCOUNT_COOKIE,
        token,
        max_age=int(accounts.SESSION_ABSOLUTE.total_seconds()),
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )
    response.headers["X-CSRF-Token"] = accounts.csrf(token)
    return {**get_user(db, user_id), "kind": "student"}


# Return the connection source used for account rate limits.
def source(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# Return the configured authentication mode.
@router.get("/auth/capabilities", response_model=s.AuthCapabilities)
def capabilities():
    return {"mode": get_settings().auth_mode}


# Activate an invited student account and open its first session.
@router.post(
    "/auth/register",
    status_code=201,
    response_model=s.StudentSessionUser,
    responses=errors(400, 403, 404, 409, 415, 422, 429, 503),
)
def register(data: s.Registration, request: Request, response: Response, db: Session = DB_DEP):
    student_mode()
    user_id, token = accounts.register(
        db, data.studentId, data.password, data.activationToken, source(request)
    )
    return student_result(db, user_id, token, response)


# Authenticate a student and open a new session.
@router.post(
    "/auth/login",
    response_model=s.StudentSessionUser,
    responses=errors(401, 403, 404, 415, 422, 429, 503),
)
def login(data: s.AuthCredentials, request: Request, response: Response, db: Session = DB_DEP):
    student_mode()
    user_id, token = accounts.login(db, data.studentId, data.password, source(request))
    return student_result(db, user_id, token, response)


# Redeem a recovery token and change the account password.
@router.post(
    "/auth/password/reset/confirm",
    status_code=204,
    responses=errors(400, 403, 404, 415, 422, 429, 503),
)
def reset_password(data: s.ResetPassword, request: Request, db: Session = DB_DEP):
    student_mode()
    accounts.reset_password(db, data.studentId, data.resetToken, data.password, source(request))


# Revoke the current student session and remove its cookie.
@router.post("/auth/logout", status_code=204, responses=errors(401, 403, 404, 503))
def logout(request: Request, response: Response, db: Session = DB_DEP):
    student_mode()
    token = request.cookies.get(ACCOUNT_COOKIE)
    if token:
        accounts.revoke(db, token)
    response.delete_cookie(
        ACCOUNT_COOKIE,
        path="/",
        secure=True,
        httponly=True,
        samesite="strict",
    )


# Change the password of the signed-in student.
@router.post(
    "/auth/password/change", status_code=204, responses=errors(401, 403, 404, 422, 429, 503)
)
def change_password(data: s.ChangePassword, request: Request, db: Session = DB_DEP):
    student_mode()
    user_id = current_user(request, db)
    accounts.change_password(db, user_id, data.currentPassword, data.password, source(request))


# Sign a demo identity into the browser session.
@router.post("/demo/session", response_model=s.SessionUser, responses=errors(403, 404, 422, 503))
def session(data: s.SessionInput, response: Response, db: Session = DB_DEP):
    settings = get_settings()
    if not settings.demo_mode or not settings.session_secret:
        raise ServiceError(404, "not_found", "演示模式未启用")
    token = URLSafeTimedSerializer(settings.session_secret, salt="teamup-session").dumps(
        data.persona
    )
    user = get_user(db, PERSONAS[data.persona])
    response.set_cookie(
        "teamup_session", token, max_age=86400, httponly=True, samesite="strict", path="/"
    )
    return {**user, "persona": data.persona}


# Return the authenticated identity and restore the student CSRF token.
@router.get(
    "/me", response_model=s.SessionUser | s.StudentSessionUser, responses=errors(401, 404, 503)
)
def me(
    request: Request, response: Response, user: str = Depends(current_user), db: Session = DB_DEP
):
    if get_settings().auth_mode == "student":
        response.headers["X-CSRF-Token"] = accounts.csrf(request.cookies[ACCOUNT_COOKIE])
        return {**get_user(db, user), "kind": "student"}
    persona = next(key for key, user_id in PERSONAS.items() if user_id == user)
    return {**get_user(db, user), "persona": persona}

from pathlib import Path
from uuid import UUID

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api import schemas as s
from app.competitions import OFFICIAL_COMPETITIONS
from app.config import get_settings
from app.db.session import get_db
from app.demo import PERSONAS
from app.services import teamup

router = APIRouter(prefix="/api/v1")
DB_DEP = Depends(get_db)


def errors(*codes: int):
    return {code: {"model": s.Error} for code in codes}


def optional_user(request: Request) -> str | None:
    settings = get_settings()
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


def current_user(request: Request) -> str:
    user = optional_user(request)
    if user is not None:
        return user
    raise teamup.ServiceError(401, "unauthorized", "请先选择演示身份")


@router.post("/demo/session", response_model=s.User, responses=errors(403, 404, 422, 503))
def session(data: s.SessionInput, response: Response, db: Session = DB_DEP):
    settings = get_settings()
    if not settings.demo_mode or not settings.session_secret:
        raise teamup.ServiceError(404, "not_found", "演示模式未启用")
    token = URLSafeTimedSerializer(settings.session_secret, salt="teamup-session").dumps(
        data.persona
    )
    response.set_cookie(
        "teamup_session", token, max_age=86400, httponly=True, samesite="strict", path="/"
    )
    return teamup.get_user(db, PERSONAS[data.persona])


@router.get("/me", response_model=s.User, responses=errors(401, 404, 503))
def me(user: str = Depends(current_user), db: Session = DB_DEP):
    return teamup.get_user(db, user)


@router.get("/health/ready", response_model=s.Ready, responses=errors(503))
def ready(db: Session = DB_DEP):
    try:
        db.execute(text("SELECT 1"))
        actual = set(db.execute(text("SELECT version_num FROM alembic_version")).scalars())
        config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
        config.set_main_option(
            "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
        )
        expected = set(ScriptDirectory.from_config(config).get_heads())
        if actual != expected:
            raise ValueError("migration mismatch")
    except (SQLAlchemyError, ValueError, OSError):
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "not_ready", "message": "数据库或迁移不可用"}},
        )
    return {"status": "ready"}


@router.get(
    "/profiles",
    response_model=s.ProfileList,
    response_model_exclude_unset=True,
    responses=errors(422, 503),
)
def profiles(skill: s.Skill | None = None, db: Session = DB_DEP):
    return {"items": teamup.list_profiles(db, skill)}


@router.get(
    "/profiles/{user_id}",
    response_model=s.PublicProfile,
    response_model_exclude_unset=True,
    responses=errors(404, 422, 503),
)
def profile(user_id: UUID, db: Session = DB_DEP):
    return teamup.get_profile(db, str(user_id))


@router.get(
    "/profiles/{user_id}/evidence/{image_id}",
    response_class=Response,
    responses={
        200: {"content": {"image/webp": {"schema": {"type": "string", "format": "binary"}}}},
        **errors(404, 422, 503),
    },
)
def profile_evidence(
    user_id: UUID, image_id: UUID, viewer: str | None = Depends(optional_user), db: Session = DB_DEP
) -> Response:
    return Response(
        teamup.get_evidence(db, str(user_id), str(image_id), viewer),
        media_type="image/webp",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.get("/me/profile", response_model=s.Profile, responses=errors(401, 404, 503))
def my_profile(user: str = Depends(current_user), db: Session = DB_DEP):
    return teamup.get_profile(db, user, private=True)


@router.put("/me/profile", response_model=s.Profile, responses=errors(401, 403, 404, 422, 503))
def put_profile(data: s.ProfileInput, user: str = Depends(current_user), db: Session = DB_DEP):
    return teamup.put_profile(db, user, data.model_dump(mode="json", exclude_none=True))


@router.get("/competitions", response_model=s.CompetitionList)
def competitions() -> s.CompetitionList:
    return s.CompetitionList(
        items=[
            s.Competition(id=competition_id, name=names.name, nameEn=names.english)
            for competition_id, names in OFFICIAL_COMPETITIONS.items()
        ]
    )


@router.get("/recruitments", response_model=s.RecruitmentList, responses=errors(422, 503))
def recruitments(skill: s.Skill | None = None, db: Session = DB_DEP):
    return {"items": teamup.list_recruitments(db, skill)}


@router.get(
    "/recruitments/{recruitment_id}", response_model=s.Recruitment, responses=errors(404, 422, 503)
)
def recruitment(recruitment_id: UUID, db: Session = DB_DEP):
    return teamup.get_recruitment(db, str(recruitment_id))


@router.post(
    "/recruitments",
    status_code=201,
    response_model=s.Recruitment,
    responses=errors(401, 403, 409, 422, 503),
)
def create_recruitment(
    data: s.RecruitmentInput, user: str = Depends(current_user), db: Session = DB_DEP
):
    return teamup.create_recruitment(db, user, data.model_dump())


@router.get(
    "/me/intents",
    response_model=s.IntentList,
    response_model_exclude_none=True,
    responses=errors(401, 503),
)
def intents(user: str = Depends(current_user), db: Session = DB_DEP):
    return {"items": teamup.list_intents(db, user)}


@router.get(
    "/intents/{intent_id}",
    response_model=s.IntentDetail,
    response_model_exclude_none=True,
    responses=errors(401, 404, 422, 503),
)
def intent(intent_id: UUID, user: str = Depends(current_user), db: Session = DB_DEP):
    return teamup.get_intent(db, user, str(intent_id))


@router.post(
    "/intents",
    status_code=201,
    response_model=s.Intent,
    response_model_exclude_none=True,
    responses={200: {"model": s.Intent}, **errors(401, 403, 404, 422, 503)},
)
def create_intent(
    data: s.IntentInput, response: Response, user: str = Depends(current_user), db: Session = DB_DEP
):
    result, created = teamup.create_intent(
        db, user, data.model_dump(mode="json", exclude_none=True)
    )
    response.status_code = 201 if created else 200
    return result


@router.post(
    "/intents/{intent_id}/response",
    response_model=s.Intent,
    response_model_exclude_none=True,
    responses=errors(401, 403, 404, 409, 422, 503),
)
def respond(
    intent_id: str, data: s.Decision, user: str = Depends(current_user), db: Session = DB_DEP
):
    return teamup.respond_intent(db, user, str(intent_id), data.decision)

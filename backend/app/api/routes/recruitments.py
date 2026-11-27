from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import DB_DEP, current_user, errors
from app.api.schemas import recruitments as s
from app.api.schemas.base import Skill
from app.competitions import OFFICIAL_COMPETITIONS
from app.services import recruitments as service

router = APIRouter()


@router.get("/competitions", response_model=s.CompetitionList)
def competitions() -> s.CompetitionList:
    """List officially supported competitions."""
    return s.CompetitionList(
        items=[
            s.Competition(id=competition_id, name=names.name, nameEn=names.english)
            for competition_id, names in OFFICIAL_COMPETITIONS.items()
        ]
    )


@router.get("/recruitments", response_model=s.RecruitmentList, responses=errors(422, 503))
def recruitments(skill: Skill | None = None, db: Session = DB_DEP):
    """List published recruitments, with an optional skill filter."""
    return {"items": service.list_recruitments(db, skill)}


@router.get(
    "/recruitments/{recruitment_id}", response_model=s.Recruitment, responses=errors(404, 422, 503)
)
def recruitment(recruitment_id: UUID, db: Session = DB_DEP):
    """Return a single published recruitment."""
    return service.get_recruitment(db, str(recruitment_id))


@router.post(
    "/recruitments",
    status_code=201,
    response_model=s.Recruitment,
    responses=errors(401, 403, 409, 422, 503),
)
def create_recruitment(
    data: s.RecruitmentInput, user: str = Depends(current_user), db: Session = DB_DEP
):
    """Create a recruitment owned by the signed-in user."""
    return service.create_recruitment(db, user, data.model_dump())


@router.get("/me/recruitments", response_model=s.RecruitmentList, responses=errors(401, 503))
def own_recruitments(user: str = Depends(current_user), db: Session = DB_DEP):
    """List recruitments owned by the signed-in user."""
    return {"items": service.list_own_recruitments(db, user)}


@router.put(
    "/recruitments/{recruitment_id}",
    response_model=s.Recruitment,
    responses=errors(401, 403, 404, 422, 503),
)
def update_recruitment(
    recruitment_id: UUID,
    data: s.RecruitmentInput,
    user: str = Depends(current_user),
    db: Session = DB_DEP,
):
    """Save edits to a recruitment when requested by its owner."""
    return service.update_recruitment(db, user, str(recruitment_id), data.model_dump())


@router.patch(
    "/recruitments/{recruitment_id}/visibility",
    response_model=s.Recruitment,
    responses=errors(401, 403, 404, 409, 422, 503),
)
def set_recruitment_visibility(
    recruitment_id: UUID,
    data: s.RecruitmentVisibility,
    user: str = Depends(current_user),
    db: Session = DB_DEP,
):
    """Publish or unpublish a recruitment when requested by its owner."""
    return service.set_recruitment_visibility(db, user, str(recruitment_id), data.isPublished)

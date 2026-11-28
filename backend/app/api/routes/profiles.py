from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.dependencies import DB_DEP, current_user, errors, optional_user
from app.api.schemas import profiles as s
from app.services.profiles.read import get_evidence, get_profile, list_profiles
from app.services.profiles.write import put_profile as save_profile
from app.services.profiles.write import set_visibility

router = APIRouter()


@router.get(
    "/profiles",
    response_model=s.ProfileList,
    response_model_exclude_unset=True,
    responses=errors(422, 503),
)
def profiles(skill: str | None = None, search: str | None = None, db: Session = DB_DEP):
    """List public profiles, with an optional skill filter."""
    return {"items": list_profiles(db, search or skill)}


@router.get(
    "/profiles/{user_id}",
    response_model=s.PublicProfile,
    response_model_exclude_unset=True,
    responses=errors(404, 422, 503),
)
def profile(user_id: UUID, db: Session = DB_DEP):
    """Return the public projection of one profile."""
    return get_profile(db, str(user_id))


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
    """Return one evidence image if the viewer can access it."""
    return Response(
        get_evidence(db, str(user_id), str(image_id), viewer),
        media_type="image/webp",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.get("/me/profile", response_model=s.Profile, responses=errors(401, 404, 503))
def my_profile(user: str = Depends(current_user), db: Session = DB_DEP):
    """Read the signed-in user's private editable profile."""
    return get_profile(db, user, private=True)


@router.put("/me/profile", response_model=s.Profile, responses=errors(401, 403, 404, 422, 503))
def put_profile(data: s.ProfileInput, user: str = Depends(current_user), db: Session = DB_DEP):
    """Validate and save the signed-in user's profile."""
    return save_profile(db, user, data.model_dump(mode="json", exclude_none=True))


@router.patch(
    "/me/profile/visibility",
    response_model=s.ProfileVisibility,
    responses=errors(401, 403, 404, 422, 503),
)
def profile_visibility(
    data: s.ProfileVisibility, user: str = Depends(current_user), db: Session = DB_DEP
):
    """Publish or unpublish the signed-in user's profile."""
    return set_visibility(db, user, data.listed)

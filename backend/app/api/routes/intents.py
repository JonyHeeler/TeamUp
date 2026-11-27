from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.dependencies import DB_DEP, current_user, errors
from app.api.schemas import intents as s
from app.services import intent_views
from app.services import intents as service

router = APIRouter()


# List intents in which the signed-in user participates.
@router.get(
    "/me/intents",
    response_model=s.IntentList,
    response_model_exclude_none=True,
    responses=errors(401, 503),
)
def intents(user: str = Depends(current_user), db: Session = DB_DEP):
    """Return summaries of all intents involving the signed-in user."""
    return {"items": intent_views.list_intents(db, user)}


# Read the private detail of an intent as a participant.
@router.get(
    "/intents/{intent_id}",
    response_model=s.IntentDetail,
    response_model_exclude_none=True,
    responses=errors(401, 404, 422, 503),
)
def intent(intent_id: UUID, user: str = Depends(current_user), db: Session = DB_DEP):
    """Return the detail visible to this participant."""
    return intent_views.get_intent(db, user, str(intent_id))


# Create an application or invitation, returning any existing intent for the pair.
@router.post(
    "/intents",
    status_code=201,
    response_model=s.Intent,
    response_model_exclude_none=True,
    responses={200: {"model": s.Intent}, **errors(401, 403, 404, 409, 422, 503)},
)
def create_intent(
    data: s.IntentInput, response: Response, user: str = Depends(current_user), db: Session = DB_DEP
):
    """Create an intent or return the original on duplicate submission."""
    result, created = service.create_intent(
        db, user, data.model_dump(mode="json", exclude_none=True)
    )
    response.status_code = 201 if created else 200
    return result


# Accept or decline an intent as its recipient.
@router.post(
    "/intents/{intent_id}/response",
    response_model=s.Intent,
    response_model_exclude_none=True,
    responses=errors(401, 403, 404, 409, 422, 503),
)
def respond(
    intent_id: UUID, data: s.Decision, user: str = Depends(current_user), db: Session = DB_DEP
):
    """Record the recipient's decision and optional response note."""
    return service.respond_intent(db, user, str(intent_id), data.decision, data.message)

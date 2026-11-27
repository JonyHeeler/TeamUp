from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, contains_eager

from app.db.models import Contact, Intent, Recruitment, User
from app.services.common import missing, timestamp, visible_member


def counterpart_id(intent: Intent, user_id: str) -> str:
    """Get the other participant's ID for this viewer."""
    sender, recipient = intent.participants
    return recipient if user_id == sender else sender


def intent_data(
    db: Session, intent: Intent, user_id: str, nicknames: dict[str, str] | None = None
) -> dict[str, Any]:
    """Project an intent summary without private notes or contact details."""
    sender, recipient = intent.participants
    result = {
        "id": intent.id,
        "candidateId": intent.candidate_id,
        "senderId": sender,
        "recipientId": recipient,
        "kind": intent.kind,
        "status": intent.status,
        "createdAt": timestamp(intent.created_at),
        "canRespond": intent.status == "pending" and user_id == recipient,
    }
    other = counterpart_id(intent, user_id)
    if nicknames is None:
        user = db.get(User, other)
        nickname = user.nickname if user else None
    else:
        nickname = nicknames.get(other)
    if intent.recruitment:
        result.update(
            recruitmentId=intent.recruitment_id,
            ownerId=intent.recruitment.owner_id,
            teamName=intent.recruitment.team_name,
        )
    if nickname:
        result["counterpartNickname"] = nickname
    if intent.responded_at:
        result["respondedAt"] = timestamp(intent.responded_at)
    return result


def list_intents(db: Session, user_id: str) -> list[dict[str, Any]]:
    """List team and personal intents involving the current user."""
    query = (
        select(Intent)
        .outerjoin(Intent.recruitment)
        .options(contains_eager(Intent.recruitment))
        .where(
            or_(
                Intent.candidate_id == user_id,
                Recruitment.owner_id == user_id,
                Intent.personal_sender_id == user_id,
            )
        )
        .order_by(Intent.created_at.desc())
    )
    intents = db.scalars(query).all()
    other_ids = {counterpart_id(intent, user_id) for intent in intents}
    nicknames = dict(db.execute(select(User.id, User.nickname).where(User.id.in_(other_ids))).all())
    return [intent_data(db, intent, user_id, nicknames) for intent in intents]


def participant_intent(db: Session, user_id: str, intent_id: str) -> Intent:
    """Read an intent and verify participant access."""
    intent = db.get(Intent, intent_id)
    if not intent or user_id not in intent.participants:
        raise missing()
    return intent


def get_intent(db: Session, user_id: str, intent_id: str) -> dict[str, Any]:
    """Read stored notes and any contact shared by accepting the intent."""
    intent = participant_intent(db, user_id, intent_id)
    result = intent_data(db, intent, user_id)
    if intent.message:
        result["message"] = intent.message
    if intent.response_message:
        result["responseMessage"] = intent.response_message
    if intent.status == "accepted":
        other = counterpart_id(intent, user_id)
        contact = db.get(Contact, other) if visible_member(db, other) else None
        if contact:
            result["counterpartQq"] = contact.qq
    return result

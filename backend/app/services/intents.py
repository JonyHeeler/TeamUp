from typing import Any
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.competitions import OFFICIAL_COMPETITION_NAMES
from app.db.models import Contact, Intent, Profile, Recruitment
from app.services.common import ServiceError, invalid, missing, now, optional_text, visible_member
from app.services.intent_views import intent_data, participant_intent


def recruitment_target(db: Session, user_id: str, data: dict[str, Any]) -> Recruitment:
    """Verify the recruitment is published and the invitation is authorized."""
    recruitment = db.get(Recruitment, data.get("recruitmentId"), with_for_update=True)
    if (
        not recruitment
        or recruitment.competition not in OFFICIAL_COMPETITION_NAMES
        or not visible_member(db, recruitment.owner_id)
    ):
        raise missing()
    if data["kind"] == "invite" and recruitment.owner_id != user_id:
        raise ServiceError(403, "forbidden", "只有队长可以邀请")
    if not recruitment.is_published:
        raise ServiceError(409, "conflict", "这支队伍的招募已下架")
    return recruitment


def create_intent(db: Session, user_id: str, data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Create one intent per target pair and return the original on retry."""
    kind = data["kind"]
    recruitment = None if kind == "personal" else recruitment_target(db, user_id, data)
    owner = recruitment.owner_id if recruitment else user_id
    candidate_id = user_id if kind == "apply" else data["candidateId"]
    candidate = db.get(Profile, candidate_id, with_for_update=True)
    if (
        candidate_id == owner
        or not candidate
        or not visible_member(db, candidate_id)
        or (kind != "apply" and not candidate.listed)
    ):
        raise invalid("对方名片不可用，或不能向自己发起击掌")
    contacts = db.scalars(select(Contact.user_id).where(Contact.user_id.in_((owner, candidate_id))))
    if len(contacts.all()) != 2:
        raise invalid("双方均需先填写 QQ 号")

    pair = ":".join(sorted((owner, candidate_id))) if kind == "personal" else None
    recruitment_id = recruitment.id if recruitment else None
    intent = Intent(
        id=str(uuid4()),
        recruitment_id=recruitment_id,
        candidate_id=candidate_id,
        personal_sender_id=user_id if kind == "personal" else None,
        personal_pair=pair,
        kind=kind,
        message=optional_text(data.get("message"), 300),
        status="pending",
        created_at=now(),
    )
    db.add(intent)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        unique_key = "uq_intent_personal_pair" if pair else "uq_intent_recruitment_candidate"
        if not (exc.orig.args and exc.orig.args[0] == 1062 and unique_key in str(exc.orig)):
            raise
        query = select(Intent)
        if pair:
            query = query.where(Intent.personal_pair == pair)
        else:
            query = query.where(
                Intent.recruitment_id == recruitment_id, Intent.candidate_id == candidate_id
            )
        existing = db.scalar(query)
        if not existing:
            raise
        return intent_data(db, existing, user_id), False
    return intent_data(db, intent, user_id), True


def respond_intent(
    db: Session, user_id: str, intent_id: str, decision: str, message: str | None = None
) -> dict[str, Any]:
    """Store the first decision and note atomically, leaving both intact on retries."""
    intent = participant_intent(db, user_id, intent_id)
    if intent.participants[1] != user_id:
        raise ServiceError(403, "forbidden", "只有收件人可以回应")
    result = db.execute(
        update(Intent)
        .where(Intent.id == intent_id, Intent.status == "pending")
        .values(status=decision, responded_at=now(), response_message=optional_text(message, 300))
        .execution_options(synchronize_session=False)
    )
    db.commit()
    db.refresh(intent)
    if result.rowcount == 0 and intent.status != decision:
        raise ServiceError(409, "conflict", "击掌申请已有不同回应")
    return intent_data(db, intent, user_id)

from datetime import datetime

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import Base, table_options, utc_type, uuid_type
from app.db.models.recruitments import Recruitment


class Intent(Base):
    """Store a team or personal intent and its response state."""

    __tablename__ = "intents"
    __table_args__ = (
        UniqueConstraint("recruitment_id", "candidate_id", name="uq_intent_recruitment_candidate"),
        UniqueConstraint("personal_pair", name="uq_intent_personal_pair"),
        CheckConstraint(
            "(kind = 'personal' AND recruitment_id IS NULL AND personal_sender_id IS NOT NULL "
            "AND personal_pair IS NOT NULL AND personal_sender_id <> candidate_id) OR "
            "(kind <> 'personal' AND recruitment_id IS NOT NULL AND personal_sender_id IS NULL "
            "AND personal_pair IS NULL)",
            name="ck_intent_target",
        ),
        CheckConstraint(
            "(status = 'pending' AND responded_at IS NULL) OR (status <> 'pending' AND responded_at IS NOT NULL)",
            name="ck_intent_response_time",
        ),
        Index("ix_intent_candidate_created", "candidate_id", "created_at"),
        Index("ix_intent_personal_sender_created", "personal_sender_id", "created_at"),
        table_options,
    )
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    recruitment_id: Mapped[str | None] = mapped_column(uuid_type, ForeignKey("recruitments.id"))
    candidate_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("profiles.user_id"))
    personal_sender_id: Mapped[str | None] = mapped_column(uuid_type, ForeignKey("users.id"))
    personal_pair: Mapped[str | None] = mapped_column(String(73))
    kind: Mapped[str] = mapped_column(Enum("apply", "invite", "personal", name="intent_kind"))
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "declined", name="intent_status")
    )
    created_at: Mapped[datetime] = mapped_column(utc_type)
    responded_at: Mapped[datetime | None] = mapped_column(utc_type)
    message: Mapped[str | None] = mapped_column(String(300))
    response_message: Mapped[str | None] = mapped_column(String(300))
    recruitment: Mapped[Recruitment | None] = relationship()

    @property
    def participants(self) -> tuple[str, str]:
        """Return the initiating user and the only user allowed to respond."""
        if self.personal_sender_id is not None:
            return self.personal_sender_id, self.candidate_id
        assert self.recruitment is not None
        owner_id = self.recruitment.owner_id
        return (
            (self.candidate_id, owner_id) if self.kind == "apply" else (owner_id, self.candidate_id)
        )

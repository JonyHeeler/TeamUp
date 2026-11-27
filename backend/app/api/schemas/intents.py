from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import StringConstraints, model_validator

from app.api.schemas.base import DTO

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


class IntentInput(DTO):
    """Validate a team or personal intent before it enters the workflow."""

    kind: Literal["apply", "invite", "personal"]
    recruitmentId: UUID | None = None
    candidateId: UUID | None = None
    message: Note | None = None

    @model_validator(mode="after")
    def validate_target(self):
        """Require the target fields used by the selected workflow."""
        if (self.kind != "apply") != (self.candidateId is not None):
            raise ValueError("邀请和个人击掌需要指定对方，加入申请从当前身份获取申请人")
        if (self.kind != "personal") != (self.recruitmentId is not None):
            raise ValueError("加入申请和入队邀请需要指定队伍")
        return self


class Intent(DTO):
    """Expose workflow state and the current viewer's available action."""

    id: str
    recruitmentId: str | None = None
    candidateId: str
    ownerId: str | None = None
    senderId: str
    recipientId: str
    kind: Literal["apply", "invite", "personal"]
    status: Literal["pending", "accepted", "declined"]
    createdAt: datetime
    respondedAt: datetime | None = None
    canRespond: bool
    teamName: str | None = None
    counterpartNickname: str | None = None


class IntentDetail(Intent):
    """Include the stored notes and the contact allowed for this viewer."""

    message: str | None = None
    responseMessage: str | None = None
    counterpartQq: str | None = None


class IntentList(DTO):
    """Wrap the current participant's intent summaries."""

    items: list[Intent]


class Decision(DTO):
    """Allow the recipient to accept or decline with an optional note."""

    decision: Literal["accepted", "declined"]
    message: Note | None = None

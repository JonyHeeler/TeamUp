from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


Text80 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Text500 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]

Skill = Literal["data-analysis", "development", "design", "presentation"]
Persona = Literal["captain", "candidate-a", "candidate-b"]


class SessionInput(DTO):
    persona: Persona


class User(DTO):
    userId: str
    nickname: str


class PublicFields(DTO):
    major: bool = False
    grade: bool = False
    experience: bool = False


class ProfileInput(DTO):
    nickname: Text80 | None = None
    skills: list[Skill] = Field(min_length=1)
    contribution: Text500
    major: str | None = Field(default=None, max_length=80)
    grade: str | None = Field(default=None, max_length=80)
    experience: str | None = Field(default=None, max_length=500)
    publicFields: PublicFields = Field(default_factory=PublicFields)


class Profile(ProfileInput):
    userId: str
    nickname: str


class PublicProfile(DTO):
    userId: str
    nickname: str
    skills: list[Skill]
    contribution: str
    major: str | None = None
    grade: str | None = None
    experience: str | None = None


class ProfileList(DTO):
    items: list[PublicProfile]


class RecruitmentInput(DTO):
    competition: Text80
    teamName: Text80
    openings: int = Field(gt=0, le=2147483647, strict=True)
    skills: list[Skill] = Field(min_length=1)
    task: Text500


class Recruitment(RecruitmentInput):
    id: str
    ownerId: str
    createdAt: datetime


class RecruitmentList(DTO):
    items: list[Recruitment]


class IntentInput(DTO):
    kind: Literal["apply", "invite"]
    recruitmentId: UUID
    candidateId: UUID | None = None

    @model_validator(mode="after")
    def validate_candidate(self):
        if (self.kind == "invite") != (self.candidateId is not None):
            raise ValueError("邀请必须指定候选人，申请不能指定候选人")
        return self


class Intent(DTO):
    id: str
    recruitmentId: str
    candidateId: str
    ownerId: str
    kind: Literal["apply", "invite"]
    status: Literal["pending", "accepted", "declined"]
    createdAt: datetime
    respondedAt: datetime | None = None
    canRespond: bool


class IntentDetail(Intent):
    counterpartQq: str | None = None


class IntentList(DTO):
    items: list[Intent]


class Decision(DTO):
    decision: Literal["accepted", "declined"]


class ErrorBody(DTO):
    code: str
    message: str
    fields: dict[str, str] | None = None


class Error(DTO):
    error: ErrorBody


class Ready(DTO):
    status: Literal["ready"]

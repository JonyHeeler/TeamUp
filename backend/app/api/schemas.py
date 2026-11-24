from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.services.evidence import BASE64_LIMIT, MAX_EVIDENCE


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


Text80 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Text500 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Text1200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)]

Skill = Literal[
    "data-analysis",
    "development",
    "design",
    "presentation",
    "mathematical-modeling",
    "machine-learning",
    "agent-development",
    "data-collection",
    "frontend",
    "backend",
    "product-management",
    "user-research",
    "academic-writing",
    "business-analysis",
    "finance",
    "video-editing",
    "project-management",
]
Persona = Literal["captain", "candidate-a", "candidate-b"]


class SessionInput(DTO):
    persona: Persona


class User(DTO):
    userId: str
    nickname: str


class PublicFields(DTO):
    college: bool = True
    major: bool = False
    grade: bool = False
    experience: bool = False
    availability: bool = False
    preferredRole: bool = False
    interests: bool = False


class PublicCustomField(DTO):
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
    value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class CustomField(PublicCustomField):
    isPublic: bool = False


class ProfileFields(DTO):
    nickname: Text80 | None = None
    skills: list[Skill]
    contribution: Text500
    college: str | None = Field(default=None, max_length=80)
    major: str | None = Field(default=None, max_length=80)
    grade: str | None = Field(default=None, max_length=80)
    experience: str | None = Field(default=None, max_length=500)
    availability: str | None = Field(default=None, max_length=80)
    preferredRole: str | None = Field(default=None, max_length=80)
    interests: str | None = Field(default=None, max_length=80)
    customSkills: list[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
    ] = Field(default_factory=list, max_length=12)
    customFields: list[CustomField] = Field(default_factory=list, max_length=8)
    publicFields: PublicFields = Field(default_factory=PublicFields)


class RetainEvidence(DTO):
    id: UUID


class UploadEvidence(DTO):
    image: str = Field(min_length=1, max_length=BASE64_LIMIT, description="Base64 image data")


class ProfileInput(ProfileFields):
    college: Text80
    qq: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    evidence: list[RetainEvidence | UploadEvidence] | None = Field(
        default=None, max_length=MAX_EVIDENCE
    )


class Profile(ProfileFields):
    userId: str
    nickname: str
    qq: str | None
    evidenceIds: list[UUID]


class PublicProfile(DTO):
    userId: str
    nickname: str
    skills: list[Skill]
    contribution: str
    college: str | None = None
    major: str | None = None
    grade: str | None = None
    experience: str | None = None
    availability: str | None = None
    preferredRole: str | None = None
    interests: str | None = None
    customSkills: list[str] = Field(default_factory=list)
    customFields: list[PublicCustomField] = Field(default_factory=list)
    evidenceIds: list[UUID] | None = None


class ProfileList(DTO):
    items: list[PublicProfile]


class Competition(DTO):
    id: str
    name: str
    nameEn: str


class CompetitionList(DTO):
    items: list[Competition]


class RecruitmentRequirement(DTO):
    skills: list[Skill] = Field(default_factory=list)
    expectation: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = (
        None
    )


class RecruitmentInput(DTO):
    competition: Text80
    teamName: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    openings: int = Field(gt=0, le=100, strict=True)
    requirements: list[RecruitmentRequirement] = Field(min_length=1, max_length=100)
    background: Text1200


class Recruitment(DTO):
    id: str
    ownerId: str
    createdAt: datetime
    competition: Text80
    teamName: Text80
    teamNumber: str
    openings: int
    skills: list[Skill]
    requirements: list[RecruitmentRequirement]
    background: Text1200


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

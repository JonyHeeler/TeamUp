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
    "mobile-development",
    "statistics",
    "data-visualization",
    "ui-ux",
    "graphic-design",
    "market-research",
    "business-planning",
    "slide-design",
    "copywriting",
]
Persona = Literal["captain", "candidate-a", "candidate-b"]


class SessionInput(DTO):
    persona: Persona


class User(DTO):
    userId: str
    nickname: str


class SessionUser(User):
    persona: Persona


class StudentSessionUser(User):
    kind: Literal["student"] = "student"


class AuthCapabilities(DTO):
    mode: Literal["off", "demo", "student"]


class AuthCredentials(DTO):
    studentId: str = Field(min_length=4, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class Registration(AuthCredentials):
    activationToken: str = Field(min_length=1, max_length=200)


class ResetPassword(AuthCredentials):
    resetToken: str = Field(min_length=1, max_length=200)


class ChangePassword(DTO):
    currentPassword: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=128)


class PublicFields(DTO):
    college: bool = True
    major: bool = False
    grade: bool = False
    experience: bool = False
    competitionIntent: bool = False


class ProfileProject(DTO):
    competition: Text80
    role: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] = ""
    award: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] = ""
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


class ProfileFields(DTO):
    nickname: Text80 | None = None
    skills: list[Skill]
    contribution: Text500
    college: str | None = Field(default=None, max_length=80)
    major: str | None = Field(default=None, max_length=80)
    grade: str | None = Field(default=None, max_length=80)
    experience: str | None = Field(default=None, max_length=500)
    competitionIntent: str | None = Field(default=None, max_length=500)
    projects: list[ProfileProject] = Field(default_factory=list, max_length=20)
    customSkills: list[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
    ] = Field(default_factory=list, max_length=12)
    publicFields: PublicFields = Field(default_factory=PublicFields)


class RetainEvidence(DTO):
    id: UUID


class UploadEvidence(DTO):
    image: str = Field(min_length=1, max_length=BASE64_LIMIT, description="Base64 image data")


class ProfileInput(ProfileFields):
    college: Text80
    major: Text80
    grade: Text80
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
    competitionIntent: str | None = None
    projects: list[ProfileProject] = Field(default_factory=list, max_length=20)
    customSkills: list[str] = Field(default_factory=list)
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


RecruitmentDuration = Literal[7, 14, 30]
RecruitmentStatus = Literal["active", "unpublished", "expired"]


class RecruitmentInput(DTO):
    competition: Text80
    teamName: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    openings: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    requirements: list[RecruitmentRequirement] = Field(default_factory=list, max_length=100)
    background: Text1200
    durationDays: RecruitmentDuration | None = None


class TeamMemberInfo(DTO):
    userId: str
    nickname: str
    role: Literal["captain", "member"]
    joinedAt: datetime
    skills: list[Skill] = Field(default_factory=list)
    customSkills: list[str] = Field(default_factory=list)
    hasProfile: bool = False


class Recruitment(DTO):
    id: str
    teamId: str
    ownerId: str
    createdAt: datetime
    isPublished: bool
    competition: Text80
    teamName: Text80
    teamNumber: str
    openings: str | None = None
    skills: list[Skill]
    requirements: list[RecruitmentRequirement]
    background: Text1200
    memberCount: int = 1
    members: list[TeamMemberInfo] = Field(default_factory=list)
    status: RecruitmentStatus = "active"
    isPubliclyActive: bool = True
    publishedAt: datetime | None = None
    expiresAt: datetime | None = None
    durationDays: RecruitmentDuration | None = None


class RecruitmentVisibility(DTO):
    isPublished: bool
    durationDays: RecruitmentDuration | None = None


class RecruitmentRepublishInput(DTO):
    durationDays: RecruitmentDuration = 14


class RecruitmentRenewInput(DTO):
    durationDays: RecruitmentDuration = 14
    expectedExpiresAt: datetime | None = None


class RecruitmentList(DTO):
    items: list[Recruitment]


class IntentInput(DTO):
    kind: Literal["apply", "invite", "personal"]
    recruitmentId: UUID | None = None
    candidateId: UUID | None = None
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None
    sourcePersonalIntentId: UUID | None = None

    @model_validator(mode="after")
    def validate_candidate(self):
        if self.kind == "apply":
            if self.recruitmentId is None or self.candidateId is not None:
                raise ValueError("入队申请必须指定队伍且不能指定候选人")
            if self.sourcePersonalIntentId is not None:
                raise ValueError("入队申请不支持关联个人配对记录")
        elif self.kind == "invite":
            if self.recruitmentId is None or self.candidateId is None:
                raise ValueError("入队邀请必须同时指定队伍和候选人")
        else:
            if self.recruitmentId is not None or self.candidateId is None:
                raise ValueError("个人邀请必须指定对方用户且不能指定队伍")
            if self.sourcePersonalIntentId is not None:
                raise ValueError("个人邀请不支持关联个人配对记录")
        return self


class Intent(DTO):
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
    expiresAt: datetime
    isExpired: bool
    canRespond: bool
    teamName: str | None = None
    counterpartNickname: str | None = None


class IntentDetail(Intent):
    message: str | None = None
    responseMessage: str | None = None
    counterpartQq: str | None = None


class IntentList(DTO):
    items: list[Intent]


class CreateTeamInviteInput(RecruitmentInput):
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class TeamInviteResult(DTO):
    recruitment: Recruitment
    intent: Intent


class HighFiveCandidateSource(DTO):
    intentId: str
    kind: Literal["personal", "invite", "apply"]
    recruitmentId: str | None = None
    teamName: str | None = None
    expiresAt: datetime


class HighFiveCandidate(DTO):
    userId: str
    nickname: str
    skills: list[Skill]
    customSkills: list[str] = Field(default_factory=list)
    expiresAt: datetime
    sources: list[HighFiveCandidateSource]


class HighFiveCandidateList(DTO):
    items: list[HighFiveCandidate]


class TeamSummary(DTO):
    id: str
    captainId: str
    competition: Text80
    teamName: Text80
    teamNumber: str
    description: Text1200
    status: Literal["active", "disbanded"]
    createdAt: datetime
    myRole: Literal["captain", "member"]
    memberCount: int
    members: list[TeamMemberInfo]
    recruitment: Recruitment | None = None


class TeamList(DTO):
    items: list[TeamSummary]


class CreateTeamInput(DTO):
    competition: Text80
    teamName: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    description: Text1200
    publishRecruitment: bool = False
    durationDays: RecruitmentDuration | None = None
    openings: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    requirements: list[RecruitmentRequirement] = Field(default_factory=list, max_length=100)
    inviteeIds: list[UUID] = Field(default_factory=list, max_length=20)
    inviteMessage: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None
    ) = None


class UpdateTeamInput(DTO):
    competition: Text80
    teamName: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    description: Text1200


class TeamInvitationInput(DTO):
    inviteeIds: list[UUID] = Field(min_length=1, max_length=20)
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class TeamInvitationDecision(DTO):
    decision: Literal["accepted", "declined"]
    responseMessage: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None
    ) = None


class TeamInvitation(DTO):
    id: str
    teamId: str
    teamName: str
    competition: str
    inviterId: str
    inviterNickname: str | None = None
    inviteeId: str
    inviteeNickname: str | None = None
    status: Literal["pending", "accepted", "declined"]
    message: str | None = None
    responseMessage: str | None = None
    createdAt: datetime
    respondedAt: datetime | None = None
    expiresAt: datetime
    isExpired: bool
    canRespond: bool


class TeamInvitationList(DTO):
    items: list[TeamInvitation]


class CreateTeamResult(DTO):
    team: TeamSummary
    recruitment: Recruitment | None = None
    invitations: list[TeamInvitation] = Field(default_factory=list)


class UserSearchItem(DTO):
    userId: str
    nickname: str
    skills: list[Skill]
    customSkills: list[str] = Field(default_factory=list)


class UserSearchList(DTO):
    items: list[UserSearchItem]


class Decision(DTO):
    decision: Literal["accepted", "declined"]
    responseMessage: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None
    ) = None


class ErrorBody(DTO):
    code: str
    message: str
    fields: dict[str, str] | None = None


class Error(DTO):
    error: ErrorBody


class Ready(DTO):
    status: Literal["ready"]

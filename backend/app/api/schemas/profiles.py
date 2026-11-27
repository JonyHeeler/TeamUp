from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints

from app.api.schemas.base import DTO, Skill, Text80, Text500
from app.services.profiles.evidence import BASE64_LIMIT, MAX_EVIDENCE


class PublicFields(DTO):
    """Record which optional profile fields the owner has made public."""

    qq: bool = True
    college: bool = True
    major: bool = False
    grade: bool = False
    experience: bool = False
    competitionIntent: bool = False


class ProfileProject(DTO):
    """Describe a competition project and the owner's contribution."""

    competition: Text80
    role: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] = ""
    award: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] = ""
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


class ProfileFields(DTO):
    """Define the editable fields shared by profile reads and writes."""

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
    """Reference an existing evidence image to keep on save."""

    id: UUID


class UploadEvidence(DTO):
    """Carry a new image encoded as base64."""

    image: str = Field(min_length=1, max_length=BASE64_LIMIT, description="Base64 image data")


class ProfileInput(ProfileFields):
    """Validate a profile update and its private contact information."""

    college: Text80
    major: Text80
    grade: Text80
    qq: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    evidence: list[RetainEvidence | UploadEvidence] | None = Field(
        default=None, max_length=MAX_EVIDENCE
    )


class Profile(ProfileFields):
    """Return the owner's full editable profile and saved image IDs."""

    listed: bool
    userId: str
    nickname: str
    qq: str | None
    evidenceIds: list[UUID]


class PublicProfile(DTO):
    """Expose the public projection of a profile."""

    qq: str | None = None
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
    """Wrap public profiles in the standard list response."""

    items: list[PublicProfile]


class ProfileVisibility(DTO):
    """Change whether a profile appears in public discovery."""

    listed: bool

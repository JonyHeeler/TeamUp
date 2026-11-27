from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.api.schemas.base import DTO, Skill, Text80, Text1200


class Competition(DTO):
    """Describe an entry in the official competition catalog."""

    id: str
    name: str
    nameEn: str


class CompetitionList(DTO):
    """Wrap the official competition catalog in a list response."""

    items: list[Competition]


class RecruitmentRequirement(DTO):
    """Describe the expectations for one recruitment slot."""

    skills: list[Skill] = Field(default_factory=list)
    expectation: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = (
        None
    )


class RecruitmentInput(DTO):
    """Validate the fields supplied when creating or editing a recruitment."""

    competition: Text80
    teamName: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    openings: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    requirements: list[RecruitmentRequirement] = Field(max_length=100)
    background: Text1200


class Recruitment(DTO):
    """Expose a saved recruitment and its generated team number."""

    id: str
    ownerId: str
    ownerNickname: str
    createdAt: datetime
    isPublished: bool
    competition: Text80
    teamName: Text80
    teamNumber: str
    openings: str | None
    skills: list[Skill]
    requirements: list[RecruitmentRequirement]
    background: Text1200


class RecruitmentVisibility(DTO):
    """Request a change to a recruitment's published status."""

    isPublished: bool


class RecruitmentList(DTO):
    """Wrap recruitment records in the standard list response."""

    items: list[Recruitment]

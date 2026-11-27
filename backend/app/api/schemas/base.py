from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints


# Reject extra fields in all API request and response models.
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

from typing import Literal

from app.api.schemas.base import DTO


# Describe a request failure and any field-specific validation errors.
class ErrorBody(DTO):
    code: str
    message: str
    fields: dict[str, str] | None = None


# Wrap failures in the shared API error envelope.
class Error(DTO):
    error: ErrorBody


# Confirm that the API can reach the database at the expected migration.
class Ready(DTO):
    status: Literal["ready"]

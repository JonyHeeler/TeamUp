from typing import Literal

from pydantic import Field

from app.api.schemas.base import DTO

Persona = Literal["captain", "candidate-a", "candidate-b", "candidate-c"]


# Select one of the predefined demo identities.
class SessionInput(DTO):
    persona: Persona


# Identify a user without exposing account credentials.
class User(DTO):
    userId: str
    nickname: str


# Identify the current demo user and persona.
class SessionUser(User):
    persona: Persona


# Identify the current authenticated student.
class StudentSessionUser(User):
    kind: Literal["student"] = "student"


# Advertise the authentication mode the browser can use.
class AuthCapabilities(DTO):
    mode: Literal["off", "demo", "student"]


# Carry a student identifier and password for authentication.
class AuthCredentials(DTO):
    studentId: str = Field(min_length=4, max_length=32)
    password: str = Field(min_length=1, max_length=128)


# Redeem an activation token when creating an account.
class Registration(AuthCredentials):
    activationToken: str = Field(min_length=1, max_length=200)


# Redeem a reset token and set a new password.
class ResetPassword(AuthCredentials):
    resetToken: str = Field(min_length=1, max_length=200)


# Prove knowledge of the current password and supply its replacement.
class ChangePassword(DTO):
    currentPassword: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=128)

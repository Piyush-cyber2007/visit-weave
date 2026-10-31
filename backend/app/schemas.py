from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .roles import Role


class OTPRequest(BaseModel):
    phone_number: str = Field(pattern=r"^\+[1-9][0-9]{7,14}$")

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class OTPVerify(OTPRequest):
    otp: str = Field(pattern=r"^[0-9]{6}$")


class DoctorLogin(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=1, max_length=256)
    remember_me: bool = False

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class OTPRequestResponse(BaseModel):
    message: str
    resend_after_seconds: int
    delivery_mode: str
    development_otp: str | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None
    phone_number: str | None
    role: Role
    is_active: bool
    is_verified: bool
    display_name: str | None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class AuthorizationCheck(BaseModel):
    required_roles: list[Role] = Field(min_length=1, max_length=5)


class AuthorizedPrincipal(BaseModel):
    user_id: UUID
    role: Role

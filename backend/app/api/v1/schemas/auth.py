"""Authentication response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, model_validator


class UserResponse(BaseModel):
    """Public user information resolved from Clerk-authenticated API calls."""

    id: uuid.UUID
    email: str
    full_name: str
    avatar_url: str | None = None
    role: str
    organization: str | None = None
    is_active: bool
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRegister(BaseModel):
    """User registration schema."""

    email: str
    password: str
    full_name: str | None = None
    name: str | None = None
    organization: str | None = None

    @model_validator(mode="after")
    def resolve_name(self) -> "UserRegister":
        if not self.full_name and self.name:
            self.full_name = self.name
        elif not self.full_name:
            self.full_name = self.email.split("@")[0]
        return self


class UserLogin(BaseModel):
    """User login credentials schema."""

    email: str
    password: str


class TokenResponse(BaseModel):
    """Token authentication response."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


"""Authentication response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel


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
    full_name: str
    organization: str | None = None


class UserLogin(BaseModel):
    """User login credentials schema."""

    email: str
    password: str


class TokenResponse(BaseModel):
    """Token authentication response."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


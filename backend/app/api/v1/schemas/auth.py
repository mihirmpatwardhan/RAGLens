"""
RAGLense - API Schemas for Authentication

Pydantic models for request/response validation at the API boundary.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ──────────────────────────────────────────────
# Request Schemas
# ──────────────────────────────────────────────


class RegisterRequest(BaseModel):
    """User registration payload."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    organization: str | None = None


class LoginRequest(BaseModel):
    """User login payload."""

    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    """Token refresh payload."""

    refresh_token: str


# ──────────────────────────────────────────────
# Response Schemas
# ──────────────────────────────────────────────


class UserResponse(BaseModel):
    """Public user information."""

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


class TokenResponse(BaseModel):
    """JWT token pair response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class AuthResponse(BaseModel):
    """Combined auth response with user + tokens."""

    user: UserResponse
    tokens: TokenResponse

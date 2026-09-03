"""
Authentication router.

The product uses Clerk or custom local JWT for authentication.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, get_db
from app.api.v1.schemas.auth import TokenResponse, UserLogin, UserRegister, UserResponse
from app.core.security import create_access_token, hash_password, verify_password
from app.infrastructure.db.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(current_user: CurrentUser):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.post(
    "/register",
    response_model=UserResponse,
    summary="Register a new user using local email and password credentials",
)
async def register(
    payload: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user. Throws exception if email is already taken."""
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == payload.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create new user
    new_user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        organization=payload.organization,
        is_active=True,
        is_verified=True,  # Local dev auto-verifies
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    logger.info(f"Registered new user {payload.email} successfully.")
    return new_user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate a user and return custom JWT token",
)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate email and password, returning user info and JWT access token."""
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    # Generate custom access token
    access_token = create_access_token(subject=str(user.id))
    logger.info(f"User {payload.email} logged in successfully.")
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )

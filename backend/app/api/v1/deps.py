"""
RAGLense - API Dependencies

Dependency injection for authentication, database sessions, and services.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_access_token
from app.infrastructure.db.base import get_async_session
from app.infrastructure.db.models.user import User

security = HTTPBearer()


async def get_db() -> AsyncSession:
    """Get an async database session."""
    async for session in get_async_session():
        yield session


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Extract and validate the current user from custom JWT or Clerk JWT."""
    token = credentials.credentials
    user_id = None
    email = None
    is_clerk = False

    # 1. Try Custom JWT first
    try:
        payload = verify_access_token(token)
        user_id_str = payload.get("sub")
        if user_id_str:
            import uuid
            user_id = uuid.UUID(user_id_str)
    except ValueError:
        # 2. Try Clerk JWT
        try:
            from app.core.clerk import verify_clerk_token
            clerk_payload = await verify_clerk_token(token)
            clerk_id = clerk_payload.get("sub")
            if clerk_id:
                import uuid
                # Generate deterministic UUID from Clerk User ID
                user_id = uuid.uuid5(uuid.NAMESPACE_DNS, clerk_id)
                email = clerk_payload.get("email") or clerk_payload.get("primary_email_address")
                is_clerk = True
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    # 3. Retrieve user from database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    # 4. Auto-provision Clerk user if not found
    if user is None:
        if is_clerk:
            user = User(
                id=user_id,
                email=email or f"clerk_{user_id.hex[:8]}@clerk.user",
                hashed_password="clerk_managed_password",
                full_name="Clerk User",
                is_active=True,
                is_verified=True,
            )
            db.add(user)
            await db.flush()
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


# Type aliases for cleaner endpoint signatures
CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]

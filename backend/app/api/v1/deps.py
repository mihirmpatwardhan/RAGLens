"""
RAGLense - API Dependencies

Dependency injection for authentication, database sessions, and services.
"""

import secrets
import uuid
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
                # Never a real password — Clerk owns auth; this field must be non-null
                # so we fill it with a cryptographically random value that nobody knows.
                hashed_password=secrets.token_hex(32),
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


# ──────────────────────────────────────────────
# RBAC Dependency Factories (Phase 6)
# ──────────────────────────────────────────────

_ROLE_HIERARCHY = {"owner": 3, "editor": 2, "viewer": 1}


async def get_kb_role(
    kb_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> str | None:
    """Return the current user's role in the given KB, or None if no membership."""
    from sqlalchemy import select as sa_select

    from app.infrastructure.db.models.knowledge import KnowledgeBase
    from app.infrastructure.db.models.rbac import KnowledgeBaseMember

    # KB owners are implicitly 'owner' regardless of members table
    kb_result = await db.execute(
        sa_select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    )
    kb = kb_result.scalar_one_or_none()
    if kb is None:
        return None
    if kb.owner_id == user.id:
        return "owner"

    # Check members table
    member_result = await db.execute(
        sa_select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    return member.role if member else None


def require_kb_role(minimum_role: str):
    """FastAPI dependency factory: assert user has at least `minimum_role` in the KB.

    Usage::
        @router.delete("/{kb_id}")
        async def delete_kb(kb_id: uuid.UUID, _: Annotated[None, Depends(require_kb_role("owner"))]):
            ...
    """
    async def _dependency(
        kb_id: uuid.UUID,
        current_user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> None:
        role = await get_kb_role(kb_id, current_user, db)

        if role is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Knowledge base not found",
            )

        required_level = _ROLE_HIERARCHY.get(minimum_role, 1)
        user_level = _ROLE_HIERARCHY.get(role, 0)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{minimum_role}' role in this knowledge base. Your role: '{role}'.",
            )

    return _dependency


# Convenience type aliases — import these in routers
RequireKBOwner = Annotated[None, Depends(require_kb_role("owner"))]
RequireKBEditor = Annotated[None, Depends(require_kb_role("editor"))]
RequireKBViewer = Annotated[None, Depends(require_kb_role("viewer"))]

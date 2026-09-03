"""
RAGLens - Knowledge Base Members Router (Phase 6 RBAC)

Manage who has access to a knowledge base and what role they hold.

Endpoints:
  GET    /knowledge-bases/{kb_id}/members         — list members
  POST   /knowledge-bases/{kb_id}/members         — invite member by email
  PATCH  /knowledge-bases/{kb_id}/members/{user_id} — change role
  DELETE /knowledge-bases/{kb_id}/members/{user_id} — remove member
"""

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.infrastructure.db.models.rbac import KnowledgeBaseMember
from app.infrastructure.db.models.user import User

router = APIRouter(prefix="/knowledge-bases", tags=["RBAC"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class MemberResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str | None
    full_name: str | None
    role: str
    invited_by: uuid.UUID | None

    class Config:
        from_attributes = True


class MemberListResponse(BaseModel):
    members: list[MemberResponse]
    total: int


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: Literal["editor", "viewer"] = "viewer"


class UpdateMemberRoleRequest(BaseModel):
    # Ownership is represented by KnowledgeBase.owner_id and is intentionally
    # not assignable through the member endpoint. Transfer ownership needs a
    # dedicated, auditable operation instead of silently creating two owners.
    role: Literal["editor", "viewer"]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get(
    "/{kb_id}/members",
    response_model=MemberListResponse,
    summary="List members of a knowledge base",
)
async def list_kb_members(
    kb_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """List all members (and their roles) for a KB. Requires at least viewer access."""
    from app.api.v1.deps import get_kb_role
    role = await get_kb_role(kb_id, current_user, db)
    if role is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    result = await db.execute(
        select(KnowledgeBaseMember, User)
        .join(User, KnowledgeBaseMember.user_id == User.id)
        .where(KnowledgeBaseMember.knowledge_base_id == kb_id)
    )
    rows = result.all()

    members = [
        MemberResponse(
            id=member.id,
            user_id=member.user_id,
            email=user.email,
            full_name=getattr(user, "full_name", None),
            role=member.role,
            invited_by=member.invited_by,
        )
        for member, user in rows
    ]
    return MemberListResponse(members=members, total=len(members))


@router.post(
    "/{kb_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a user to a knowledge base",
)
async def invite_member(
    kb_id: uuid.UUID,
    request: InviteMemberRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Invite a user by email to a knowledge base. Requires owner access."""
    from app.api.v1.deps import get_kb_role
    role = await get_kb_role(kb_id, current_user, db)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the KB owner can invite members.",
        )

    # Look up user by email
    user_result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No user found with email '{request.email}'. They must register first.",
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot invite yourself.",
        )

    # Check if already a member
    existing = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this knowledge base.",
        )

    member = KnowledgeBaseMember(
        knowledge_base_id=kb_id,
        user_id=user.id,
        role=request.role,
        invited_by=current_user.id,
    )
    db.add(member)
    await db.flush()
    await db.refresh(member)

    return MemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=user.email,
        full_name=getattr(user, "full_name", None),
        role=member.role,
        invited_by=member.invited_by,
    )


@router.patch(
    "/{kb_id}/members/{user_id}",
    response_model=MemberResponse,
    summary="Update a member's role",
)
async def update_member_role(
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    request: UpdateMemberRoleRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Change a member's role. Requires owner access."""
    from app.api.v1.deps import get_kb_role
    role = await get_kb_role(kb_id, current_user, db)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the KB owner can change member roles.",
        )

    result = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")

    member.role = request.role
    await db.flush()
    await db.refresh(member)

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    return MemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=user.email if user else None,
        full_name=getattr(user, "full_name", None) if user else None,
        role=member.role,
        invited_by=member.invited_by,
    )


@router.delete(
    "/{kb_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member from a knowledge base",
)
async def remove_member(
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Remove a member. Requires owner access, or a user can remove themselves."""
    from app.api.v1.deps import get_kb_role
    role = await get_kb_role(kb_id, current_user, db)

    is_self_removal = user_id == current_user.id
    if not is_self_removal and role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the KB owner can remove other members.",
        )

    result = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")

    await db.delete(member)
